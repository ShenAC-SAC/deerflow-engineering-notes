import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 深读正文集合(只放 published 的站)。地图卡片元数据在 src/data/journey.ts。
// zod schema 是「校验牙齿」:frontmatter 不合规则构建直接失败。
const tutorials = defineCollection({
  // generateId 必须包含语言目录,否则 zh/02 与 en/02 撞同名 id、互相覆盖。
  loader: glob({
    pattern: '**/*.mdx',
    base: './src/content/tutorials',
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: z.object({
    lang: z.enum(['zh', 'en']),
    slug: z.string(),                       // 与 journey.ts 的 slug 对应
    station: z.number().int().positive(),   // 与 journey.ts 的 station 对应
    title: z.string(),                      // 页面 <title> / SEO
    sha: z.string(),                        // 钉的 commit(锚定不变量)
    sourceRefs: z.array(z.string()).min(1), // 钉死的源码文件/函数(check:refs 校验)
  }),
});

export const collections = { tutorials };
