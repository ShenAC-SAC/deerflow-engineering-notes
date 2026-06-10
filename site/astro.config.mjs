// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// DeerFlow 可视化源码教程博客
// i18n: 中英双语,默认中文,两个 locale 都带前缀(/zh, /en)
const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === 'true' || process.env.DEPLOY_TARGET === 'github-pages';

export default defineConfig({
  // GitHub Pages 项目页需要子路径 base；本地开发保持根路径，避免 localhost:4321 变成 404。
  site: 'https://ShenAC-SAC.github.io',
  base: isGitHubPagesBuild ? '/deerflow-engineering-notes/' : '/',
  integrations: [mdx()],
  i18n: {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
    routing: { prefixDefaultLocale: true },
  },
  markdown: {
    // 暖纸主题:浅色、克制的 Shiki 主题(背景再由 theme.css 压回暖纸沉底色)
    shikiConfig: { theme: 'vitesse-light', wrap: true },
  },
});
