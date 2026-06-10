#!/usr/bin/env node
// 内容守卫:让「语义过度造词」和「地图/正文漂移」无法悄悄回来。
//
// 1) 违禁词:trace/调试器隐喻不该殖民用户文案。视觉气质留给视觉系统,
//    文字用自然的工程博客中文(站 / 篇 / 源码锚点 / 已发布 / 计划中)。
// 2) 一致性:每个 published 站都要有 zh+en 深读;每篇 MDX 的 station/slug
//    必须和 journey.ts 对得上。
//
// 用法: node scripts/check-content.mjs   (从 tutorials/site 运行)
// 退出码: 0 通过 / 1 有违例(并列出)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');                       // tutorials/site
const srcDir = join(root, 'src');
const contentDir = join(srcDir, 'content/tutorials');
const journeyPath = join(srcDir, 'data/journey.ts');

// —— 违禁词(trace/帧 隐喻)。视觉随意,文字别造这些词。——
const BANNED = ['帧', '已捕获', '源码栈帧', '上工台', '追踪前沿', '现场笔记'];
const SCAN_EXT = ['.astro', '.ts', '.mdx', '.css'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const failures = [];

// 1) 违禁词扫描
for (const file of walk(srcDir)) {
  if (!SCAN_EXT.some((e) => file.endsWith(e))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const term of BANNED) {
      if (line.includes(term)) {
        failures.push(`${relative(root, file)}:${i + 1}  含违禁词「${term}」 → ${line.trim()}`);
      }
    }
  });
}

// 2) 地图/正文一致性
// 2a) 解析 journey.ts(单行格式:station: N, slug: '...', risk: N, altitude: '...', status: '...')
const journeySrc = readFileSync(journeyPath, 'utf8');
const stationRe =
  /station:\s*(\d+),\s*slug:\s*'([^']+)',\s*risk:\s*\d+,\s*altitude:\s*'[^']+',\s*status:\s*'(published|locked)'/g;
const journey = new Map(); // station -> { slug, status }
for (const m of journeySrc.matchAll(stationRe)) {
  journey.set(Number(m[1]), { slug: m[2], status: m[3] });
}
if (journey.size === 0) failures.push(`journey.ts: 没解析出任何 station(格式变了?更新 check-content.mjs)`);

// 2b) 收集 MDX 的 frontmatter(lang/slug/station)
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const b = m[1];
  return {
    lang: (b.match(/^lang:\s*(\S+)/m) || [])[1],
    slug: (b.match(/^slug:\s*(\S+)/m) || [])[1],
    station: Number((b.match(/^station:\s*(\d+)/m) || [])[1]),
  };
}
const mdxByStation = new Map(); // station -> Set(lang)
for (const file of walk(contentDir)) {
  if (!file.endsWith('.mdx')) continue;
  const fm = frontmatter(readFileSync(file, 'utf8'));
  const rel = relative(root, file);
  if (!fm || !fm.lang || !fm.slug || !fm.station) {
    failures.push(`${rel}: frontmatter 缺 lang/slug/station`);
    continue;
  }
  const j = journey.get(fm.station);
  if (!j) failures.push(`${rel}: station ${fm.station} 在 journey.ts 里不存在`);
  else if (j.slug !== fm.slug) failures.push(`${rel}: slug「${fm.slug}」≠ journey.ts 的「${j.slug}」`);
  if (!mdxByStation.has(fm.station)) mdxByStation.set(fm.station, new Set());
  mdxByStation.get(fm.station).add(fm.lang);
}

// 2c) 每个 published 站都要有 zh + en
for (const [station, { status, slug }] of journey) {
  if (status !== 'published') continue;
  const langs = mdxByStation.get(station) || new Set();
  for (const need of ['zh', 'en']) {
    if (!langs.has(need)) failures.push(`journey.ts: 站 ${station}(${slug})是 published,但缺 ${need} 深读 MDX`);
  }
}

if (failures.length) {
  console.error(`\n✗ 内容守卫失败 (${failures.length}):\n`);
  for (const x of failures) console.error('  ' + x);
  console.error('');
  process.exit(1);
}

const pub = [...journey.values()].filter((s) => s.status === 'published').length;
console.log(`✓ 内容守卫通过:无违禁词;${journey.size} 站(已发布 ${pub})地图与正文一致。`);
