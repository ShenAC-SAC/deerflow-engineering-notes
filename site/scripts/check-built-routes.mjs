#!/usr/bin/env node
// 构建产物守卫:确保默认英文首页和中英切换链接没有漂移。

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = join(root, 'dist');
const base =
  process.env.GITHUB_ACTIONS === 'true' || process.env.DEPLOY_TARGET === 'github-pages'
    ? '/deerflow-engineering-notes'
    : '';

const href = (path) => `${base}${path}`;
const failures = [];
const baseline = JSON.parse(readFileSync(join(root, 'src/data/source.json'), 'utf8'));

function readBuilt(path) {
  const file = join(dist, path, 'index.html');
  if (!existsSync(file)) {
    failures.push(`${path || '/'}: 缺少构建产物 ${file}`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function mustInclude(label, html, needle, reason) {
  if (!html.includes(needle)) failures.push(`${label}: 缺少 ${JSON.stringify(needle)} (${reason})`);
}

function mustExclude(label, html, needle, reason) {
  if (html.includes(needle)) failures.push(`${label}: 不应包含 ${JSON.stringify(needle)} (${reason})`);
}

const rootHtml = readBuilt('');
const zhHome = readBuilt('zh');
const enHome = readBuilt('en');
const zhStop = readBuilt('zh/journey/1');
const enStop = readBuilt('en/journey/1');

mustInclude('/', rootHtml, '<html lang="en">', '根路径必须默认英文');
mustInclude('/', rootHtml, '<title>DeerFlow Engineering Notes</title>', '英文首页标题');
mustInclude('/', rootHtml, 'From a prompt to an agent run', '英文首页主标题');
mustInclude('/', rootHtml, `href="${href('/zh/')}"`, '英文首页应可切换到中文首页');
mustInclude('/', rootHtml, 'EN → ZH', '英文首页切换标签');
mustExclude('/', rootHtml, 'Redirecting to:', '根路径不能再是静态 redirect 页');

mustInclude('/zh/', zhHome, '<html lang="zh-CN">', '中文首页语言标记');
mustInclude('/zh/', zhHome, `href="${href('/')}"`, '中文首页应切回默认英文根路径');
mustInclude('/zh/', zhHome, 'ZH → EN', '中文首页切换标签');

mustInclude('/en/', enHome, '<html lang="en">', '显式英文首页语言标记');
mustInclude('/en/', enHome, `href="${href('/zh/')}"`, '显式英文首页应切换到中文首页');

mustInclude('/en/journey/1/', enStop, `href="${href('/zh/journey/1/')}"`, '英文文章应切换到对应中文文章');
mustInclude('/zh/journey/1/', zhStop, `href="${href('/en/journey/1/')}"`, '中文文章应切换到对应英文文章');

// Check every published route and bilingual counterpart, including Extension.
for (const section of ['tutorials', 'extensions']) {
  const contentRoot = join(root, 'src/content', section);
  for (const lang of ['zh', 'en']) for (const name of readdirSync(join(contentRoot, lang))) {
    if (!name.endsWith('.mdx')) continue;
    const source = readFileSync(join(contentRoot, lang, name), 'utf8');
    const id = section === 'tutorials'
      ? source.match(/^station:\s*(\d+)/m)?.[1]
      : source.match(/^slug:\s*(\S+)/m)?.[1];
    const route = section === 'tutorials' ? 'journey' : 'extensions';
    const path = `${lang}/${route}/${id}`;
    const other = lang === 'zh' ? 'en' : 'zh';
    const html = readBuilt(path);
    mustInclude(path, html, `href="${href(`/${other}/${route}/${id}/`)}"`, '双语文章切换');
    mustInclude(path, html, baseline.sha.slice(0, 8), '源码版本标注');
  }
}
mustInclude('/zh/', zhHome, 'id="extensions"', '独立 Extension 分区');
mustInclude('/', rootHtml, 'id="extensions"', '英文 Extension 分区');

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
  });
}
const pages = htmlFiles(dist);
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/href="(\/[^"\s]*)"/g)) {
    const url = match[1];
    if (url.startsWith('//')) continue;
    if (base && url !== base && !url.startsWith(`${base}/`)) {
      failures.push(`${relative(dist, file)}: 链接遗漏部署前缀 ${url}`);
      continue;
    }
    const pathname = decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]);
    const target = join(dist, pathname);
    if (!existsSync(target) || (statSync(target).isDirectory() && !existsSync(join(target, 'index.html')))) {
      failures.push(`${relative(dist, file)}: 站内链接无目标 ${url}`);
    }
  }
}

if (failures.length) {
  console.error(`\n✗ 路由守卫失败 (${failures.length}):\n`);
  for (const failure of failures) console.error('  ' + failure);
  console.error('');
  process.exit(1);
}

console.log(`✓ 路由守卫通过:${pages.length} 个页面；双语主线/Extension 切换与站内链接有效。`);
