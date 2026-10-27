#!/usr/bin/env node
// Validate frontmatter and inline references at the shared source baseline.
// Python symbols are parsed with Python 3.12+ without executing upstream code.
//
// 用法: node scripts/check-source-refs.mjs   (从 tutorials/site 运行)
// 退出码: 0 全部命中 / 1 有缺失(并列出)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));        // <repo>/site/scripts
const contentDir = resolve(here, '../src/content');
const baseline = JSON.parse(readFileSync(resolve(here, '../src/data/source.json'), 'utf8'));
// deer-flow 仓库根:优先 DEERFLOW_ROOT(独立仓库 / CI 用);
// 默认使用与本项目同级的 deer-flow clone。
const deerflowRoot = process.env.DEERFLOW_ROOT
  ? resolve(process.env.DEERFLOW_ROOT)
  : resolve(here, '../../../deer-flow');

// 锚定校验依赖一份本地 deer-flow clone。找不到就清晰报错,别静默放行。
if (!existsSync(join(deerflowRoot, 'backend'))) {
  console.error(`\n✗ 找不到 deer-flow 源码仓库:${deerflowRoot}`);
  console.error('  锚定校验需要一份本地 deer-flow clone。请设置 DEERFLOW_ROOT 指向它,例如:');
  console.error('    DEERFLOW_ROOT=/path/to/deer-flow pnpm check:refs\n');
  process.exit(1);
}

// 递归收集 .mdx
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.mdx')) out.push(p);
  }
  return out;
}

// 极简 frontmatter 解析:取首个 --- ... --- 块里的 sha 与 sourceRefs 列表
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1];
  const sha = (body.match(/^sha:\s*(\S+)\s*$/m) || [])[1];
  const refs = [];
  const lines = body.split('\n');
  let inRefs = false;
  for (const line of lines) {
    if (/^sourceRefs:\s*$/.test(line)) { inRefs = true; continue; }
    if (inRefs) {
      const item = line.match(/^\s*-\s*(.+?)\s*$/);
      if (item) refs.push(item[1]);
      else if (/^\S/.test(line)) inRefs = false; // 下一个顶格键,列表结束
    }
  }
  return { sha, refs };
}

const sourceCache = new Map();
function sourceAtSha(sha, file) {
  const key = `${sha}:${file}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  try {
    const source = execFileSync('git', ['-C', deerflowRoot, 'show', key], {
      encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    sourceCache.set(key, source);
    return source;
  } catch {
    sourceCache.set(key, null);
    return null;
  }
}

// Parse definitions without importing or executing upstream code.
const symbolCache = new Map();
function hasPythonSymbol(sha, file, symbol, source) {
  const key = `${sha}:${file}`;
  if (!symbolCache.has(key)) {
    const script = `import ast, json, sys
tree = ast.parse(sys.stdin.read())
names = []
def visit(node, prefix=''):
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            name = prefix + child.name
            names.append(name)
            visit(child, name + '.')
        else:
            visit(child, prefix)
visit(tree)
print(json.dumps(names))`;
    symbolCache.set(key, new Set(JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', script], {
      input: source, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    }))));
  }
  return symbolCache.get(key).has(symbol);
}

const files = walk(contentDir);
let checked = 0;
let symbolsChecked = 0;
const failures = [];

for (const f of files) {
  const body = readFileSync(f, 'utf8');
  const fm = parseFrontmatter(body);
  if (!fm) { failures.push(`${f}: 缺少 frontmatter`); continue; }
  if (!fm.sha) { failures.push(`${f}: 缺少 sha`); continue; }
  if (fm.sha !== baseline.sha) failures.push(`${f}: sha 与 source.json 不一致`);
  if (!fm.refs.length) { failures.push(`${f}: sourceRefs 为空`); continue; }
  const refs = fm.refs.map((ref) => {
    const [file, symbol] = ref.split(/::|#/);
    return { file: file.trim(), symbol, sha: fm.sha };
  });
  for (const match of body.matchAll(/<SourceRef\b([^>]*?)\/>/g)) {
    const props = match[1];
    const file = props.match(/\bfile="([^"]+)"/)?.[1];
    const sha = props.match(/\bsha="([^"]+)"/)?.[1];
    const symbol = props.match(/\bsymbol="([^"]+)"/)?.[1];
    if (!file || !sha) { failures.push(`${f}: SourceRef 必须有静态 file/sha`); continue; }
    if (sha !== fm.sha) failures.push(`${f}: 行内 SourceRef sha 与 frontmatter 不一致`);
    if (!fm.refs.some((ref) => ref.split(/::|#/)[0].trim() === file)) failures.push(`${f}: 行内源码未登记于 sourceRefs: ${file}`);
    refs.push({ file, sha, symbol });
  }
  for (const { file, sha, symbol } of refs) {
    checked++;
    const source = sourceAtSha(sha, file);
    if (source === null) {
      failures.push(`${f}\n    ✗ ${file}  @${sha}  (在该 SHA 下不存在)`);
    } else if (symbol) {
      symbolsChecked++;
      try {
        if (!file.endsWith('.py') || !hasPythonSymbol(sha, file, symbol, source)) {
          failures.push(`${f}: 未找到 Python 定义 ${file}::${symbol}`);
        }
      } catch (error) {
        failures.push(`${f}: 不能解析 ${file}: ${error.message}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\n✗ 锚定校验失败 (${failures.length}):\n`);
  for (const x of failures) console.error('  ' + x);
  console.error('');
  process.exit(1);
}

console.log(`✓ 锚定校验通过:${files.length} 篇 / ${checked} 个源码引用 / ${symbolsChecked} 个 Python 符号；基线与行内引用一致。正文语义仍需源码阅读核对。`);
