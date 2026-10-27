# 工具系统：保留的设计观察

核对基线：DeerFlow 2.2.0 开发快照 `51d59a1cdff92626bd9f03f1b2254f34a824ca3e`（2026-10-27）。

本文件结合当前实现，记录需要进一步核实的设计问题。每个问题都说明已有机制与评估条件，不将候选方案视为运行行为或已确认缺陷。

## 当前机制

工具权限由 agent 配置、装配期授权、执行期 Guardrail 与 middleware 声明工具检查共同约束。子 agent 按类型白名单、并发和总量策略执行。skill allowed-tools 是元数据，不参与工具授权。

## 仍值得研究：决策解释

“为什么这个工具本轮不可见或不能执行”仍是有价值的调试问题。但当前已有装配描述、authorization decision、deferred catalog 和 receipts。先验证这些证据能否解释一个真实案例；只有确认缺口，才考虑为已有决策增加解释信息，不能直接再造一套 ToolPolicyResult。

## 仍值得研究：配置快照

工具装配跨 AppConfig、MCP 连接与 extension generation。评估配置一致性时，先检查当前缓存、配置签名与 generation fence；只有出现它们无法覆盖的具体问题，才考虑增加工具目录快照。

## 仍值得研究：Registry / Policy / Runtime

三种职责可作为阅读模型，不必对应三个新子系统。只有出现第二个实际消费者、独立替换需要或可复现的耦合问题，才有理由改变现有模块边界。

## 核对入口

- [backend/packages/harness/deerflow/tools/tools.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/tools/tools.py)
- [backend/packages/harness/deerflow/authz/tool_filter.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/authz/tool_filter.py)
- [backend/packages/harness/deerflow/agents/middlewares/tool_declarations.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/tool_declarations.py)
- [backend/packages/harness/deerflow/runtime/assembly_evidence.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/assembly_evidence.py)
- [backend/packages/harness/deerflow/mcp/tools.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/mcp/tools.py)

验证方式：固定提交的静态源码对照；未把真实模型、多 worker 或外部服务运行结果作为本笔记的已验证事实。
