# 持久化与恢复边界

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/09-persistence.mdx) · [English](../../site/src/content/tutorials/en/09-persistence.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- 启动快照装配连接型基础设施；热更新配置不能悄悄替换一半存储。
- checkpointer、Store、RunStore、RunEventStore、ThreadMeta、文件/blob 是不同数据面。
- Checkpointer 与 Store 优先使用显式 checkpointer 配置，未配置时跟随 database。
- worker lease、heartbeat、远端取消意图与 Redis bridge 受配置和部署条件约束。
- delta checkpoint 与应用表 Alembic migration 不是同一机制。
- 恢复图状态不等于恢复 Python task，更不等于回滚外部副作用。

## 源码阅读入口

- [backend/app/gateway/deps.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/app/gateway/deps.py)
- [backend/packages/harness/deerflow/persistence/bootstrap.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/persistence/bootstrap.py)
- [backend/packages/harness/deerflow/persistence/run/sql.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/persistence/run/sql.py)
- [backend/packages/harness/deerflow/runtime/runs/manager.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/runs/manager.py)
- [backend/packages/harness/deerflow/runtime/runs/worker.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/runs/worker.py)
- [backend/packages/harness/deerflow/runtime/journal.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/journal.py)
- [backend/packages/harness/deerflow/runtime/checkpointer/async_provider.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/checkpointer/async_provider.py)
- [backend/packages/harness/deerflow/runtime/store/async_provider.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/store/async_provider.py)
- [backend/packages/harness/deerflow/runtime/checkpointer/cached_saver.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/checkpointer/cached_saver.py)
- [backend/packages/harness/deerflow/runtime/stream_bridge/redis.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/stream_bridge/redis.py)
- [backend/packages/harness/deerflow/config/database_config.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/config/database_config.py)
- [backend/packages/harness/deerflow/config/deployment_config.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/config/deployment_config.py)

优先跟踪：`langgraph_runtime`, `RunJournal`, `DatabaseConfig`, `CachedHistorySaver`, `RunManager`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
