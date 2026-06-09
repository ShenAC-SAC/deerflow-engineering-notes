// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// DeerFlow 可视化源码教程博客
// i18n: 中英双语,默认中文,两个 locale 都带前缀(/zh, /en)
export default defineConfig({
  integrations: [mdx()],
  i18n: {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
    routing: { prefixDefaultLocale: true },
  },
  markdown: {
    shikiConfig: { theme: 'night-owl', wrap: true },
  },
});
