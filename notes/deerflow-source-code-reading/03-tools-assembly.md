# 工具候选、可见性与执行

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/03-tools-assembly.mdx) · [English](../../site/src/content/tutorials/en/03-tools-assembly.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- get_available_tools 产生候选，后加工具与 middleware 声明工具也需要授权。
- skill allowed-tools 是兼容元数据，不参与工具过滤与执行授权。
- deferred catalog、promotion 与执行检查是不同边界；catalog hash 约束晋升作用域。
- 普通执行、状态更新、澄清、委派、发现工具有不同返回语义。

## 源码阅读入口

- [backend/packages/harness/deerflow/tools/tools.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/tools/tools.py)
- [backend/packages/harness/deerflow/agents/lead_agent/agent.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/lead_agent/agent.py)
- [backend/packages/harness/deerflow/authz/tool_filter.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/authz/tool_filter.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_declarations.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_declarations.py)
- [backend/packages/harness/deerflow/tools/builtins/tool_search.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/tools/builtins/tool_search.py)
- [backend/packages/harness/deerflow/agents/middlewares/deferred_tool_filter_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/deferred_tool_filter_middleware.py)
- [backend/packages/harness/deerflow/mcp/tools.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/mcp/tools.py)
- [backend/packages/harness/deerflow/guardrails/middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/guardrails/middleware.py)
- [backend/packages/harness/deerflow/skills/types.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/types.py)

优先跟踪：`get_available_tools`, `apply_tool_authorization`, `narrow_declared_tools`, `GuardrailMiddleware`, `Skill`, `assemble_deferred_tools`, `DeferredToolFilterMiddleware`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
