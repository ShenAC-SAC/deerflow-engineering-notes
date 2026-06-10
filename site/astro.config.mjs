// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// DeerFlow 可视化源码教程博客
// i18n: 中英双语,默认中文,两个 locale 都带前缀(/zh, /en)
export default defineConfig({
  // GitHub Pages 项目页:站点根 + 子路径 base(供 Astro 生成正确的资源/链接)
  site: 'https://ShenAC-SAC.github.io',
  base: '/deerflow-engineering-notes/',
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
