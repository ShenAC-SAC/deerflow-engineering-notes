# Middleware 输入、裁决与收尾

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/04-middleware-pipeline.mdx) · [English](../../site/src/content/tutorials/en/04-middleware-pipeline.mdx)
- [中文教程](../../site/src/content/tutorials/zh/05-middleware-return.mdx) · [English](../../site/src/content/tutorials/en/05-middleware-return.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- 共享 runtime base 与 lead-specific middleware 组合后，再合成 extension 并校验顺序。
- before/after/wrap 的派发方式必须分开解释；ArtifactCapture 在 before_model 捕获状态。
- durable context 将 summary、delegations、skills、artifacts 等投影到临时模型请求。
- request.override 不自动改写 checkpoint；state update 则经过 reducer 改变图状态。
- receipts 覆盖拒绝和执行结果；可关联调用不等于相邻业务结论正确。
- 正常 after_agent 与 worker 的取消、异常、终态清理共同完成生命周期。

## 源码阅读入口

- [backend/packages/harness/deerflow/agents/lead_agent/agent.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/lead_agent/agent.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_error_handling_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_error_handling_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/dynamic_context_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/dynamic_context_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/durable_context_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/durable_context_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/summarization_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/summarization_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/dangling_tool_call_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/dangling_tool_call_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/input_sanitization_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/input_sanitization_middleware.py)
- [backend/packages/harness/deerflow/agents/thread_state.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/thread_state.py)
- [backend/packages/harness/deerflow/extensions/ordering.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/extensions/ordering.py)
- [backend/packages/harness/deerflow/agents/middlewares/clarification_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/clarification_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/safety_finish_reason_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/safety_finish_reason_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/model_length_finish_reason_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/model_length_finish_reason_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/token_budget_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/token_budget_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_receipt_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_receipt_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_output_budget_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_output_budget_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/artifact_capture_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/artifact_capture_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/artifact_resolution_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/artifact_resolution_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/read_before_write_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/read_before_write_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_progress_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_progress_middleware.py)
- [backend/packages/harness/deerflow/sandbox/middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/sandbox/middleware.py)
- [backend/packages/harness/deerflow/runtime/runs/worker.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/runs/worker.py)

优先跟踪：`build_lead_runtime_middlewares`, `build_middlewares`, `assert_ordering`, `DurableContextMiddleware`, `ThreadState`, `ClarificationMiddleware`, `ArtifactResolutionMiddleware`, `ReadBeforeWriteMiddleware`, `ToolProgressMiddleware`, `ToolReceiptMiddleware`, `ToolErrorHandlingMiddleware`, `ToolOutputBudgetMiddleware`, `ArtifactCaptureMiddleware`, `SandboxMiddleware`, `run_agent`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
