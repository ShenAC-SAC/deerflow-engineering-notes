# 子 agent 与验收

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/07-subagents.mdx) · [English](../../site/src/content/tutorials/en/07-subagents.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- task 是调度工具，SubagentExecutor 创建并执行完整子 graph。
- provider tool_call_id 用于消息关联，服务端 execution_id 用于实际执行所有权。
- isolated/snapshot、并发/总量/turn/time 是不同上下文与预算约束。
- 普通 child graph 仍 checkpointer=False；持久化 batch item 管理是另一条路径。
- completed、自述、receipt 核验、acceptance holds/does not hold/UNVERIFIED 要分开。

## 源码阅读入口

- [backend/packages/harness/deerflow/tools/builtins/task_tool.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/tools/builtins/task_tool.py)
- [backend/packages/harness/deerflow/tools/builtins/batch_task_tool.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/tools/builtins/batch_task_tool.py)
- [backend/packages/harness/deerflow/subagents/executor.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/executor.py)
- [backend/packages/harness/deerflow/subagents/config.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/config.py)
- [backend/packages/harness/deerflow/subagents/capacity.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/capacity.py)
- [backend/packages/harness/deerflow/subagents/turn_budget.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/turn_budget.py)
- [backend/packages/harness/deerflow/subagents/context_snapshot.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/context_snapshot.py)
- [backend/packages/harness/deerflow/subagents/acceptance_checks.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/acceptance_checks.py)
- [backend/packages/harness/deerflow/subagents/batch_service.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/batch_service.py)
- [backend/packages/harness/deerflow/agents/middlewares/subagent_limit_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/subagent_limit_middleware.py)

优先跟踪：`task_tool`, `SubagentExecutor`, `SubagentLimitMiddleware`, `SubagentConfig`, `SubagentBatchService`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
