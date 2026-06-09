import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 深读正文集合(只放 published 的站)。地图卡片元数据在 src/data/journey.ts。
// zod schema 是「校验牙齿」:frontmatter 不合规则构建直接失败。
const tutorials = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/tutorials' }),
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
