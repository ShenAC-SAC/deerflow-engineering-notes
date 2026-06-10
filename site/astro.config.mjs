// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// DeerFlow 可视化源码教程博客
// i18n: 中英双语,根路径默认英文,同时保留显式 /en 和 /zh 路径。
const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === 'true' || process.env.DEPLOY_TARGET === 'github-pages';

export default defineConfig({
  // GitHub Pages 项目页需要子路径 base；本地开发保持根路径，避免 localhost:4321 变成 404。
  site: 'https://ShenAC-SAC.github.io',
  base: isGitHubPagesBuild ? '/deerflow-engineering-notes/' : '/',
  integrations: [mdx()],
  i18n: {
    locales: ['zh', 'en'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: true },
  },
  markdown: {
    // 暖纸主题:浅色、克制的 Shiki 主题(背景再由 theme.css 压回暖纸沉底色)
    shikiConfig: { theme: 'vitesse-light', wrap: true },
  },
});
