# Lead-agent 装配

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/02-lead-agent-factory.mdx) · [English](../../site/src/content/tutorials/en/02-lead-agent-factory.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- Gateway 使用 assemble_lead_agent；make_lead_agent 保留 graph-only 宿主签名。
- 内部装配核心是 _assemble_lead_agent；返回 graph、effective_model 与按需 descriptor。
- 先解析身份、agent 能力和授权，再将模型、工具、middleware、prompt 与状态 schema 组合。
- checkpoint full/delta 为进程模式；装配描述是配置证据，不是任务正确性证据。

## 源码阅读入口

- [backend/app/gateway/services.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/app/gateway/services.py)
- [backend/packages/harness/deerflow/agents/lead_agent/agent.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/lead_agent/agent.py)
- [backend/packages/harness/deerflow/agents/lead_agent/prompt.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/lead_agent/prompt.py)
- [backend/packages/harness/deerflow/agents/thread_state.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/thread_state.py)
- [backend/packages/harness/deerflow/models/reasoning.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/models/reasoning.py)
- [backend/packages/harness/deerflow/runtime/checkpoint_mode.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/checkpoint_mode.py)
- [backend/langgraph.json](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/langgraph.json)

优先跟踪：`resolve_agent_factory`, `assemble_lead_agent`, `resolve_reasoning_request`, `freeze_checkpoint_channel_mode`, `get_thread_state_schema`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
