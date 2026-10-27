# 请求入口与 run 主链

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/01-request-entry.mdx) · [English](../../site/src/content/tutorials/en/01-request-entry.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- 前端上传附件后 thread.submit；Web 主链由 Gateway 托管，LangGraph Server 是可选宿主。
- start_run 规范化输入、绑定认证身份和资料范围，经 RunManager 准入后启动 run_agent。
- 创建、stream 与 wait 共享生命周期；幂等复用、重新订阅、断连取消不能混为一谈。
- RunRecord、Runtime.context、RunnableConfig 与 ThreadState 分属不同职责。

## 源码阅读入口

- [frontend/src/core/threads/hooks.ts](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/frontend/src/core/threads/hooks.ts)
- [backend/app/gateway/routers/thread_runs.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/app/gateway/routers/thread_runs.py)
- [backend/app/gateway/services.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/app/gateway/services.py)
- [backend/packages/harness/deerflow/runtime/runs/manager.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/runs/manager.py)
- [backend/packages/harness/deerflow/runtime/runs/worker.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/runtime/runs/worker.py)

优先跟踪：`stream_run`, `start_run`, `build_run_config`, `run_agent`, `RunManager`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
