# DeerFlow 源码阅读 · 可视化教程博客

把 `tutorials/` 里的源码阅读笔记,升级成一个**可视化、双语、风趣一点点**的工程博客。
索引是「请求的旅程」主线(A),每一站是一张「心智模型卡」(D),点开是双语深读。

## 心智模型

```
旅程地图(数据) ──▶ src/data/journey.ts      8 站卡片元数据(双语 + 风险 + 抽象高度 + 锁定态)
深读正文(内容) ──▶ src/content/tutorials/   只放 published 的站,走 MDX + 组件
```

地图是数据、深读是内容,各自演化、互不绑架。索引读 `journey.ts` 渲染全部 8 站;
只有 `status: 'published'` 的站才有 MDX 深读页和路由。

## 命令

```bash
pnpm dev          # 本地预览 http://localhost:4321
pnpm build        # 静态构建到 dist/
pnpm preview      # 预览构建产物
pnpm check:refs   # 锚定校验:sourceRefs 必须在钉死的 SHA 下真实存在
pnpm check        # check:refs && build(提交前跑这个)
```

## 目录

```
src/
  data/journey.ts                 旅程地图(单一真相源)
  content.config.ts               深读集合 + zod schema(校验牙齿)
  content/tutorials/{zh,en}/*.mdx  双语深读正文
  components/                     RiskMeter / StationCard / JourneyIndex
                                  MentalModel / MarginNote / Philosophy
                                  Tradeoff / SourceRef / FlowDiagram
  layouts/                        BaseLayout / TutorialLayout
  pages/[lang]/index.astro        旅程首页
  pages/[lang]/journey/[station]  深读页(仅 published)
  styles/theme.css                视觉识别:工程控制台 × neo-brutalist
scripts/check-source-refs.mjs     锚定校验脚本
```

## 加一站(把某站从 locked 变 published)

1. 在 `src/data/journey.ts` 把该站 `status` 改成 `'published'`。
2. 新建 `src/content/tutorials/zh/<slug>.mdx` 和 `en/<slug>.mdx`,frontmatter:
   ```yaml
   ---
   lang: zh            # 或 en
   slug: <slug>        # 与 journey.ts 对应
   station: <n>
   title: <页面标题>
   sha: <deer-flow commit>
   sourceRefs:
     - backend/.../file.py
   ---
   ```
3. 正文用 `<MentalModel>`(开场由布局自动渲染)、`<FlowDiagram>`、`<Philosophy>`、
   `<Tradeoff>`、`<MarginNote>`、`<SourceRef>` 等组件。
4. `pnpm check` 必须绿(锚点存在 + 构建通过)。

## 约定

- 中英**统一笔调、风趣一点点**,纯文字 + 可视化,无音频。
- **工程设计哲学是一等公民**:用 `<Philosophy>` / `<Tradeoff>` 显式承载「为什么这么设计」。
- 源码指针**钉 SHA、锚定不变量**;改源码后用 `pnpm check:refs` 复核。
- 本仓库独立于 deer-flow 上游,**不进上游 PR 分支**。
