# Middleware 与运行时：保留的设计观察

核对基线：DeerFlow 2.2.0 开发快照 `51d59a1cdff92626bd9f03f1b2254f34a824ca3e`（2026-10-27）。

本文件结合当前实现，记录需要进一步核实的设计问题。每个问题都说明已有机制与评估条件，不将候选方案视为运行行为或已确认缺陷。

## 当前机制

middleware 通过语义 placement 与 ordering constraints 组合。durable context 管理上下文连续性，tool receipts 记录执行凭据，ToolProgress 和 token budget 约束推进。sandbox execution lease 管理资源借用，持久化 batch 管理独立批任务。

## 上下文连续性的评估

summary_text、delegations、skill_context、tool_artifacts、task_notes 和 task_history 已提供结构化连续性。通用 ContextItem 分类、按后续任务需要决定保留原文等思路仍可研究，但不能忽略现有机制。先用包含精确约束、文件 schema、来源消失等案例验证压缩后行为，再选择局部修复或新增分类。

## 仍值得研究：状态与副作用边界

middleware review 仍应逐项说明 hook、读取字段、状态更新、request-only transform、外部副作用、失败语义和顺序依赖。将这些信息写进现有文档与测试可能已经足够，不默认新增 RuntimeKernel 或通用元数据系统。

## 仍值得研究：资源生命周期说明

provider acquire/reuse/release、进程内借用 lease 与跨 worker ownership 是不同机制。可以在真实故障需要时补充状态机和恢复说明，但“更对称的架构”本身不是重构依据。

## 保留限制

普通 child graph 仍不做独立 checkpoint resume；存在 durable batch 不等于所有普通子执行可以跨进程接续。Python 线程中的同步操作也不因取消 await 就停止；这些是要保留的运行边界，不是凭一个新抽象就能消除的缺陷。

## 核对入口

- [backend/packages/extension-api/deerflow_extension_api/placement.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/extension-api/deerflow_extension_api/placement.py)
- [backend/packages/harness/deerflow/extensions/ordering.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/extensions/ordering.py)
- [backend/packages/harness/deerflow/agents/middlewares/durable_context_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/durable_context_middleware.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_receipt_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_receipt_middleware.py)
- [backend/packages/harness/deerflow/sandbox/lease.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/sandbox/lease.py)
- [backend/packages/harness/deerflow/subagents/batch_service.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/subagents/batch_service.py)

验证方式：固定提交的静态源码对照；未把真实模型、多 worker 或外部服务运行结果作为本笔记的已验证事实。
