# DeerFlow Engineering Notes · Site

从用户的一句 prompt 出发，沿九站理解 DeerFlow 的 Python agent runtime。
当前基线是 **2.2.0 开发快照**（2026-10-27），不是正式 Release；固定提交见 `src/data/source.json`。

## 内容结构

```text
src/data/journey.ts              九站主线元数据
src/content/tutorials/{zh,en}/   主线双语正文
src/data/extensions.ts           独立 Extension 专题目录
src/content/extensions/{zh,en}/  扩展机制、记忆后端、长期目标与调度
src/data/source.json             版本、核对日期和上游 SHA
```

九站是阅读顺序，能力实际执行时间以正文流程为准。Extension 是阅读分区，不表示所有专题都通过 Python plugin 实现。
公开正文是唯一完整教程；`../notes/` 保存源码阅读索引和仍需证据的个人设计观察。

## 安装与预览

需要 Node >=22.12、pnpm 10（与 CI 一致）、Python 3.12+ 和一份包含基线提交的 DeerFlow clone。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

预览通常在 `http://127.0.0.1:4321/`。根路径默认英文，`/zh/` 是中文首页；两种语言都提供 Extension 入口。

## 验证

```bash
DEERFLOW_ROOT=/path/to/deer-flow pnpm check
# 如果 python3 仍是旧版：
PYTHON=/path/to/python3.12 DEERFLOW_ROOT=/path/to/deer-flow pnpm check
# 验证 GitHub Pages 子路径：
DEPLOY_TARGET=github-pages DEERFLOW_ROOT=/path/to/deer-flow pnpm check
```

`DEERFLOW_ROOT` 默认指向与笔记项目同级的 `deer-flow`。校验使用 `git show SHA:path`，不会要求切换该 clone 的工作区，也不会执行上游 Python 模块。

- `check:content`：主线与专题的双语覆盖、重复条目与术语约定。
- `check:refs`：frontmatter 与行内 SourceRef 的 SHA 一致性、文件存在性、Python 定义的 AST 检查。
- `build`：Astro/MDX 静态构建。
- 构建路由检查：所有文章的语言切换、源码版本与站内链接。

文件或符号存在不能证明正文语义正确。升级时仍须阅读当前实现；页面通过也不代表真实模型、多 worker、数据库和 sandbox 已运行验证。

## 维护规则

每次升级先固定上游提交，再修改语义与图示，最后同步 `source.json`、文章 frontmatter、行内源码引用和 CI checkout。

增加主线站点时同步 `journey.ts` 与 zh/en 正文；增加专题时同步 `extensions.ts` 与 zh/en 专题正文。专题不使用 station 编号。

```yaml
---
lang: zh
slug: extension-system
title: "扩展机制：能力怎样接入一次请求"
sha: <完整上游 SHA>
sourceRefs:
  - backend/packages/harness/deerflow/extensions/loader.py
---
```

行内 SourceRef 使用静态 file/sha 属性；Python symbol 使用真实定义名，如 `ExtensionSpec` 或 `SandboxProvider.get_scoped`。
图示用现有 FlowDiagram，设计取舍用 Philosophy/Tradeoff。正文直接说明固定版本的职责、流程与边界，不穿插版本对比、改稿过程或设计落地回顾。设计观察单独记录，并说明证据与适用条件。
