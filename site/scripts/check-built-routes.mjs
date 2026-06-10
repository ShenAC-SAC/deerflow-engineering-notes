#!/usr/bin/env node
// 构建产物守卫:确保默认英文首页和中英切换链接没有漂移。

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = join(root, 'dist');
const base =
  process.env.GITHUB_ACTIONS === 'true' || process.env.DEPLOY_TARGET === 'github-pages'
    ? '/deerflow-engineering-notes'
    : '';

const href = (path) => `${base}${path}`;
const failures = [];

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
mustInclude('/', rootHtml, 'From prompt to agent run', '英文首页主标题');
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

if (failures.length) {
  console.error(`\n✗ 路由守卫失败 (${failures.length}):\n`);
  for (const failure of failures) console.error('  ' + failure);
  console.error('');
  process.exit(1);
}

console.log('✓ 路由守卫通过:根路径默认英文;中英首页/文章切换链接一致。');
