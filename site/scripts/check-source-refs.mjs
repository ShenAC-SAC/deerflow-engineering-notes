#!/usr/bin/env node
// 锚定校验:每篇 MDX 的 sourceRefs 必须在其 frontmatter 钉死的 sha 下,
// 真实存在于 deer-flow 仓库。防止源码演进后教程指针悄悄失真。
//
// 用法: node scripts/check-source-refs.mjs   (从 tutorials/site 运行)
// 退出码: 0 全部命中 / 1 有缺失(并列出)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));        // tutorials/site/scripts
const contentDir = resolve(here, '../src/content/tutorials');
const deerflowRoot = resolve(here, '../../..');             // → deer-flow 仓库根

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

function existsAtSha(sha, path) {
  // 去掉 ::symbol / #symbol,只校验文件路径
  const file = path.split('::')[0].split('#')[0].trim();
  try {
    execFileSync('git', ['-C', deerflowRoot, 'cat-file', '-e', `${sha}:${file}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const files = walk(contentDir);
let checked = 0;
const failures = [];

for (const f of files) {
  const fm = parseFrontmatter(readFileSync(f, 'utf8'));
  if (!fm) continue;
  if (!fm.sha) { failures.push(`${f}: 缺少 sha`); continue; }
  if (!fm.refs.length) { failures.push(`${f}: sourceRefs 为空`); continue; }
  for (const ref of fm.refs) {
    checked++;
    if (!existsAtSha(fm.sha, ref)) {
      failures.push(`${f}\n    ✗ ${ref}  @${fm.sha}  (在该 SHA 下不存在)`);
    }
  }
}

if (failures.length) {
  console.error(`\n✗ 锚定校验失败 (${failures.length}):\n`);
  for (const x of failures) console.error('  ' + x);
  console.error('');
  process.exit(1);
}

console.log(`✓ 锚定校验通过:${files.length} 篇 / ${checked} 个源码指针,全部在钉死的 SHA 下命中。`);
