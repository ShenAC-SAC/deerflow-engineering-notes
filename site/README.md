# DeerFlow Engineering Notes · Site

DeerFlow 2.0 Python 版工程源码手记。

站点用「请求的旅程」组织文章:从一句话进入 Gateway,到 run 创建、agent 图装配、工具能力计算,逐站拆开 DeerFlow 的运行时设计。目标是把工业级 Agent 系统讲清楚,同时保留一点轻松的工程博客语气。

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
pnpm check:content # 内容守卫:地图/正文一致,避免旧隐喻词回流
pnpm check:refs    # 锚定校验:sourceRefs 必须在钉死的 SHA 下真实存在
pnpm check         # check:content && check:refs && build(提交前跑这个)
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
  styles/theme.css                视觉识别:暖纸工程手记(牛皮纸·墨色·朱砂·制图蓝)
scripts/check-content.mjs         内容守卫:地图/正文一致 + 术语边界
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
4. `pnpm check` 必须绿(内容守卫 + 锚点存在 + 构建通过)。

## 约定

- 中英**统一笔调、风趣一点点**,纯文字 + 可视化,无音频。
- **工程设计哲学是一等公民**:用 `<Philosophy>` / `<Tradeoff>` 显式承载「为什么这么设计」。
- 源码指针**钉 SHA、锚定不变量**;改源码后用 `pnpm check:refs` 复核。
- `site/src/data/journey.ts` 是旅程地图的单一真相源;已发布站点必须同时有 zh/en 深读。
