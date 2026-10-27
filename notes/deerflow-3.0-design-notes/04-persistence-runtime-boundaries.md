# 持久化：保留的设计观察

核对基线：DeerFlow 2.2.0 开发快照 `51d59a1cdff92626bd9f03f1b2254f34a824ca3e`（2026-10-27）。

本文件结合当前实现，记录需要进一步核实的设计问题。每个问题都说明已有机制与评估条件，不将候选方案视为运行行为或已确认缺陷。

## 当前机制

Checkpointer 与 Store 优先使用显式 checkpointer 配置，未配置时跟随 database。worker lease 与 heartbeat 约束执行归属，远端取消通过持久化意图协调，Redis bridge 支持跨进程流。多实例启动校验与 delta checkpoint 各自有独立的配置条件。

## 配置优先级与消费者

显式 checkpointer 配置优先于 database。能否移除该兼容入口是迁移决策，需要识别外部配置消费者与迁移路径。没有这些证据，不建议直接引入新的 PersistenceProfile 或删除兼容支持。

## 仍值得研究：每个数据面的恢复承诺

当前教程已经分别说明 checkpoint、run、events、stream、thread metadata 与文件。若产品界面仍让用户误判可恢复性，先用具体断连/重启/过期案例验证，再改现有健康或状态输出。不要将 schema migration 与图状态恢复混为一谈。

## 仍值得研究：派生数据的修复

线程列表标题等派生值与 checkpoint 的同步仍应按实际写入路径检查。排查时先检查现有序列、incarnation 与条件写入，确认它们能否定位和修复陈旧投影，再判断是否需要补充来源或同步时间信息。

## 不会自动消失的边界

租约回收不恢复原 Python task，图 rollback 不撤销外部副作用。重复外部写入需要业务幂等；长期任务需要明确队列和恢复契约。数据库与缓存都不能替代这些协议。

## 核对入口

- [backend/packages/harness/deerflow/runtime/store/async_provider.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/store/async_provider.py)
- [backend/packages/harness/deerflow/runtime/runs/manager.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/runs/manager.py)
- [backend/packages/harness/deerflow/runtime/stream_bridge/redis.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/stream_bridge/redis.py)
- [backend/app/gateway/deps.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/app/gateway/deps.py)
- [backend/packages/harness/deerflow/persistence/thread_meta/sql.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/persistence/thread_meta/sql.py)

验证方式：固定提交的静态源码对照；未把真实模型、多 worker 或外部服务运行结果作为本笔记的已验证事实。
