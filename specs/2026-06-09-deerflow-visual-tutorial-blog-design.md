# DeerFlow 可视化源码教程博客 — 设计文档 (Design Spec)

- **日期 / Date:** 2026-06-09
- **状态 / Status:** Draft, pending user review
- **作者 / Author:** ShenAC-SAC (with Claude)
- **范围 / Scope:** 本轮 = 框架 + 1 篇打样(02 lead-agent 工厂)。其余 4+ 篇下一轮批量转。

---

## 1. 背景与目标 / Context & Goal

现有 `tutorials/` 下有一批**英文、模板化、信息密度高**的源码阅读笔记(源码阅读 4 篇 + 3.0 设计笔记 1 篇)。质量扎实,但形态是「工程档案」,不是「博客」。

目标:把它升级成一个**可视化、别具一格、风趣一点点**的工程博客,既讲清每个模块的**心智模型**,也提炼**工程设计哲学**。

设计方向(用户在可视化伴侣里选定):**A × D**
- **A 「请求的旅程」= 骨架**:首页是一条「跟着一个请求走完全程」的主线,决定顺序与叙事。
- **D 「心智模型卡」= 单元**:主线上每一站渲染成一张卡(一句话心智模型 + 风险计 + 抽象高度 + 锁定态),点开进双语深读内页。

新颖点:**把站点本身做成 DeerFlow 运行时的缩影**(请求穿过工厂式流水线),而不是套现成文档模板。

## 2. 已锁定的决策 / Locked Decisions

| 维度 | 决策 |
|---|---|
| 技术形态 | **Astro + MDX**,输出纯静态站 |
| 语言 | **中英双语,两边一视同仁、统一笔调** |
| 笔调 | **风趣一点点**(text-only,不堆梗) |
| 媒介 | **纯文字 + 可视化,无任何音频** |
| 打样篇 | **02 lead-agent 工厂** |
| 推进 | **先做样板**:框架 + 1 篇端到端,验收后再批量转 |
| 落位 | `tutorials/site/`,**不进 deer-flow 上游 PR 分支** |

## 3. 非目标 / Non-Goals

- ❌ 任何音频 / 语音旁白(只有文字与图)。
- ❌ 后端 / 数据库 / 登录(纯静态站)。
- ❌ 本轮不转其余 4+ 篇(下一轮)。
- ❌ 不进 deer-flow 上游 PR 分支(保持在用户自己的教程材料里)。
- ❌ 本轮不追求像素级精修(先验证观感与组件流水线)。

## 4. 信息架构与内容模型 / Information Architecture

用 Astro **Content Collections**,每篇教程一个条目。frontmatter 携带卡片所需元数据,并用 zod schema 强校验:

```ts
// src/content/config.ts
const tutorial = z.object({
  station: z.number().int(),                 // 旅程序号,唯一
  title: z.string(),                         // 当前 locale 的标题
  mentalModel: z.string(),                   // 卡正面那句话
  risk: z.number().int().min(1).max(5),      // 风险计 ●●●○○
  altitude: z.enum(['实现', '架构', '哲学']), // 抽象高度标签
  sourceRefs: z.array(z.string()).min(1),    // 钉死的源码文件/函数
  sha: z.string(),                           // 钉的 commit(锚定不变量)
  status: z.enum(['published', 'locked']),
});
```

- **双语机制**:Astro 原生 i18n 路由。content 按 locale 分目录:
  `src/content/tutorials/zh/02-lead-agent-factory.mdx`
  `src/content/tutorials/en/02-lead-agent-factory.mdx`
  页面路由 `/[lang]/journey/[station]`,带语言切换(切换时保持当前 station)。
- **现有 5 篇英文 md = 素材源**,重写进 collection;**不直接渲染老文件**(老文件保留在原位)。

## 5. 组件套件 / Component Kit(独特性活在这里)

| 组件 | 作用 |
|---|---|
| `<JourneyIndex>` | A 的主线首页;读 collection 按 `station` 排序生成全部站点 |
| `<StationCard>` | D 的卡:`mentalModel` + `<RiskMeter>` + `altitude` + `locked` 态 |
| `<RiskMeter value={3}/>` | 风险计,渲染 ●●●○○ |
| `<MentalModel>` | 内页开场大字(一句话心智模型) |
| `<MarginNote>` | 页边文字小注脚,放「风趣一点点」的旁白 |
| `<FlowDiagram>` | 把笔记里的 ASCII 流程图 → Mermaid(序列/流程);首页主线用自定义 CSS 保独特 |
| `<SourceRef file sha/>` | 渲染钉死的源码指针,可链到 GitHub 对应 SHA |

## 6. 视觉识别 / Visual Identity(A×D 融合)

- 深色「工程控制台」底(A 的深蓝 `#0d1b2a` 系)
- 卡片 neo-brutalist 硬投影(D 的 3px 偏移)
- 签名强调色:青 `#48cae4`
- 代码/标签等宽字体,正文干净无衬线
- 原则:**独特但不牺牲可读性**;像素级精修留到样板验收后

## 7. 项目落位 / Project Layout

```
tutorials/
  deerflow-source-code-reading/   # 现有 md(素材源,保留不动)
  deerflow-3.0-design-notes/
  specs/                          # 本设计文档所在
  site/                           # ← 新增 Astro 工程
    astro.config.mjs              # i18n 配置(zh/en)
    src/
      content/
        config.ts                 # collection + zod schema
        tutorials/{zh,en}/        # 重写后的双语 MDX
      components/                  # 第 5 节那套组件
      layouts/
      pages/
        [lang]/journey/[station].astro
        [lang]/index.astro        # JourneyIndex 首页
    scripts/check-source-refs.mjs # 第 9 节锚定校验
```

⚠️ 整套保持在用户自己的教程材料里,**不进 deer-flow 上游 PR 分支**。

## 8. 旅程地图 / The Journey(站点清单)

本轮只有 **station 2** 全量转换并 `published`,其余 `locked`(下一轮转)。

| 站 | 模块 | 一句话心智模型 | 风险 | 状态 |
|---|---|---|---|---|
| 1 | 请求入口与 agent 主链 | 一句话怎么变成一次 run | ●●○○○ | locked |
| 2 | **lead-agent 工厂** | **装配线,不是大脑** | **●●●○○** | **published(打样)** |
| 3 | 工具装配 | `list[BaseTool]` 不该是唯一真相源 | ●●●●○ | locked |
| 4 | 中间件管线 | 顺序即语义 | ●●●●● | locked |
| 5 | 沙箱系统 | — | — | locked |
| 6 | 子 agent 系统 | — | — | locked |
| 7 | 技能系统 | — | — | locked |
| 8 | 持久化 / store / checkpointer | — | — | locked |

## 9. 打样切片与验收 / Pilot Scope & Definition of Done

1. 起 Astro 工程 + i18n + collection schema + 基础主题/布局。
2. 做组件套件(第 5 节 7 个组件)。
3. `<JourneyIndex>` 首页:8 站全列,**station 2 unlocked**,其余 locked 预览。
4. **完整转 02 为双语 MDX**,跑通全部组件 = 垂直切片。
5. 验收门槛:
   - `pnpm astro build` 绿;
   - `/zh/journey/2` 与 `/en/journey/2` 都正常渲染;
   - Mermaid 出图、响应式 OK;
   - 第 10 节校验全过。
6. 验收通过后,再批量转其余站点。

## 10. 验证(有牙齿)/ Verification

- **Schema 校验**:zod 校验每篇 frontmatter — `station` 唯一、`risk∈1..5`、`sha` 非空、`sourceRefs` 非空、`altitude` 合法。`astro build` 时强制执行。
- **锚定校验脚本** `scripts/check-source-refs.mjs`:检查每篇 `sourceRefs` 的路径在所钉 `sha` 下**真实存在**于 deer-flow 仓库(防教程随源码漂移)。
- **构建必须绿**:`astro build` 不通过即不算完成。

## 11. 待确认 / 后续 Open Items

- 站点最终托管位置(GitHub Pages / Vercel / 仅本地)——本轮先本地 `astro dev` 预览,不决定托管。
- 02 之外各站的 `risk`/`altitude` 终值,在各自转换时定。
- 是否给独立教程仓库单独建 git(目前 `tutorials/` 是 deer-flow 内的未跟踪目录)。
