# Persistence / Store / Checkpointer

## One-line Mental Model

DeerFlow 的持久化是一组状态分工：LangGraph checkpointer 存可恢复的图状态；LangGraph store 存长期键值状态；DeerFlow 自己的 run store、run event store、thread metadata store 存 Gateway 需要展示、查询、恢复和审计的运行信息。

```text
LangGraph state
  -> checkpointer

LangGraph long-term KV
  -> store

Gateway runtime records
  -> runs / run_events / threads_meta
```

## System Position

Gateway 启动时，`langgraph_runtime()` 一次性装配这些组件：

```text
make_stream_bridge(config)
init_engine_from_config(config.database)
make_checkpointer(config)
make_store(config)
RunRepository or MemoryRunStore
ThreadMetaRepository or MemoryThreadMetaStore
make_run_event_store(config.run_events)
RunManager(store=run_store)
```

当前代码里，`init_engine_from_config(config.database)` 不再只是创建 engine + `Base.metadata.create_all()`。它会进入 `persistence.bootstrap.bootstrap_schema()`：

```text
empty DB
  create_all + alembic stamp head

legacy DB（有 DeerFlow 表，没有 alembic_version）
  backfill baseline tables
  stamp 0001_baseline
  upgrade head

versioned DB
  alembic upgrade head
```

这意味着 schema bootstrap / migration 是当前启动期路径的一部分。后面需要重点关注的是配置统一、恢复语义和多 worker ownership。

运行一次 agent 时，`RunContext` 把这些组件交给 `run_agent()`：

```text
RunContext(
  checkpointer,
  store,
  event_store,
  run_events_config,
  thread_store,
  app_config,
)
```

`run_agent()` 再把它们接入 LangGraph：

```text
agent.checkpointer = checkpointer
agent.store = store
Runtime(context=runtime_ctx, store=store)
config["configurable"]["__pregel_runtime"] = runtime
```

## The Five Storage Surfaces

### 1. Checkpointer

Checkpointer 是 LangGraph 的可恢复图状态存储。它保存的是 thread 的 checkpoint：

```text
channel_values
  messages
  title
  thread_data
  sandbox
  其他 ThreadState 字段

metadata
  step
  source
  writes
  parents
  created_at / updated_at

tasks / pending_writes
  interrupt、错误、下一步任务等图执行信息
```

主要消费者：

```text
/threads/{thread_id}/state
/threads/{thread_id}/history
/runs/wait 返回最终 channel_values
run rollback
worker finally 读取 title 同步到 thread_meta
```

### 2. LangGraph Store

Store 是 LangGraph 的长期 KV 存储，传给 `Runtime(store=store)` 和 `agent.store`。它不是 checkpoint，也不保存每一步图状态。

当前实现中还有一个兼容点：当没有 SQL session factory 时，`MemoryThreadMetaStore` 会把 thread metadata 存在 LangGraph Store 的 `("threads",)` namespace 下。

```text
SQL backend 存在
  thread metadata -> threads_meta 表

SQL backend 不存在
  thread metadata -> LangGraph Store 的 ("threads",) namespace
```

### 3. Run Store

Run Store 保存的是一次 run 的外部生命周期记录，不是对话内容本身：

```text
run_id
thread_id
assistant_id
user_id
status
model_name
multitask_strategy
metadata / kwargs
error
created_at / updated_at
token usage
token_usage_by_model
message_count
first_human_message
last_ai_message
```

主要消费者：

```text
/threads/{thread_id}/runs
/threads/{thread_id}/runs/{run_id}
/threads/{thread_id}/token-usage
startup orphan recovery
RunManager cancellation / status transitions
```

### 4. Run Event Store

Run Event Store 保存 run 的事件流。它把前端消息、调试记录、生命周期事件放在同一个接口里，通过 `category` 区分：

```text
category = message
  前端可展示的消息事件。

category = trace / middleware / outputs / error
  调试、审计、生命周期信息。
```

每条事件有 thread 内递增的 `seq`：

```text
thread_id
run_id
event_type
category
content
metadata
seq
created_at
```

主要消费者：

```text
/threads/{thread_id}/messages
/threads/{thread_id}/runs/{run_id}/messages
/threads/{thread_id}/runs/{run_id}/events
RunJournal.flush()
```

### 5. Thread Metadata Store

Thread metadata 是线程列表的外壳信息：

```text
thread_id
assistant_id
user_id
display_name
status
metadata
created_at / updated_at
```

它不保存完整对话，也不是 checkpoint。列表页需要快速搜索、过滤和展示标题，所以它独立出来。

主要消费者：

```text
/threads
/threads/search
auth owner check
run start 时 upsert thread_meta
run finally 时同步 title / status
delete thread 时删除 metadata row
```

## Main Run Flow

一次 run 的持久化路径可以拆成九步：

```text
1. start_run()
   RunManager.create_or_reject()
   -> 创建 RunRecord
   -> 写 RunStore pending 行

2. start_run()
   upsert thread_meta
   -> 不存在则 create
   -> 存在则 status=running

3. run_agent()
   RunManager.set_status(running)
   -> 更新 RunStore

4. run_agent()
   捕获 pre-run checkpoint
   -> 支持 rollback

5. agent.astream(...)
   LangGraph 执行
   -> checkpointer 持续写 checkpoint
   -> StreamBridge 推 SSE 事件

6. RunJournal callback
   -> 把 LLM/tool/middleware 回调转成 run events
   -> 聚合 token usage、token_usage_by_model 和摘要字段

7. run_agent() terminal status
   -> success / error / interrupted
   -> 更新 RunStore status

8. finally
   -> journal.flush()
   -> update_run_completion()
   -> checkpoint.title 同步到 thread_meta.display_name
   -> thread_meta.status 更新为 idle/error/interrupted

9. bridge.publish_end()
   -> SSE 结束
   -> bridge cleanup
```

这里有一个关键边界：SSE 是在线传输；RunEventStore 是事后查询；Checkpointer 是图状态恢复。三者可能包含相似信息，但用途不同。

## LangGraph State vs DeerFlow Runtime State

### LangGraph state

会进入 checkpointer 的，是 graph state/channel values：

```text
messages
title
thread_data
sandbox
artifacts
promoted tools
其他 ThreadState 字段
```

这些状态用于：

```text
resume
history
rollback
下一轮模型上下文
工具运行时状态
```

### DeerFlow runtime state

不会作为 ThreadState 进入 checkpoint，但 Gateway 需要管理的，是 runtime state：

```text
RunRecord
  当前进程里的 task、abort_event、status。

RunRow
  可查询的 run 元数据和 token 摘要。

RunEventRow
  消息、trace、middleware、error 等事件流。

ThreadMetaRow
  线程列表和权限所需外壳信息。

StreamBridge buffer
  当前 run 的 SSE 订阅和断线重连缓冲。

app.state singletons
  checkpointer/store/engine/event_store/run_manager 等启动期资源。
```

这些状态用于：

```text
取消 run
列 run
列消息
审计事件
线程搜索
权限检查
启动恢复
SSE join
```

## Restart Recovery

重启后能恢复什么，取决于每个 surface 是否持久化。

```text
checkpointer 持久化
  可以恢复 thread state、history、最后消息、title、sandbox_id 等图状态。

run_store 持久化
  可以恢复 run 列表、状态、token 摘要。

run_event_store 持久化
  db/jsonl 可以恢复消息和事件；memory 会丢。

thread_meta 持久化
  SQL backend 可以恢复线程列表和 owner。
  MemoryThreadMetaStore 是否能恢复，取决于它背后的 LangGraph Store 是否持久化。

StreamBridge
  进程内传输层，重启后不能恢复。

asyncio.Task / abort_event
  进程内对象，重启后不能恢复。
```

`RunManager.reconcile_orphaned_inflight_runs()` 处理的是重启后的“活跃 run 行”：

```text
数据库里还有 pending/running
但当前进程没有对应 asyncio.Task
=> 标记为 error
```

这一步把不确定状态变成明确失败，避免 UI 永远显示 running。当前 Gateway 启动时只在 `database.backend == "sqlite"` 时做这件事。

## Rollback

run 开始前，`run_agent()` 会读取当前最新 checkpoint：

```text
pre_run_checkpoint_id
pre_run_snapshot
```

如果用户取消时选择 `rollback`，worker 会：

```text
1. 标记 run 为 error
2. 如果 pre-run snapshot 为空，删除 thread checkpoint
3. 如果 snapshot 存在，写入一个新的 checkpoint
   内容来自旧 snapshot，但 id/ts 换成新的 marker
```

所以 rollback 的含义是在 LangGraph checkpointer 里写入一个新的恢复点，而非数据库事务回滚。

## Serialization Boundary

`runtime/serialization.py` 是 API 输出边界。它负责把 LangChain / LangGraph 对象变成 JSON 可返回结构：

```text
serialize_lc_object()
serialize_channel_values()
serialize_channel_values_for_api()
serialize_messages_tuple()
serialize()
```

这里有一个安全和性能边界：`ViewImageMiddleware` 会把 base64 图片块放进隐藏消息供模型使用，但 REST history/state 返回给前端时，`serialize_channel_values_for_api()` 会把 `hide_from_ui` 消息中的 data URL 图片块去掉，避免巨大 payload 和内部上下文泄漏。

## Schema Bootstrap

Application-table schema is now managed by hybrid bootstrap:

```text
persistence.engine.init_engine()
  -> bootstrap_schema(engine, backend)
```

Important details:

```text
0001_baseline
  Alembic chain root and legacy stamp target.
  Fresh DB normally uses create_all + stamp head, not baseline upgrade DDL.

0002_runs_token_usage
  Adds runs.token_usage_by_model.
  Uses safe_add_column() for idempotency and drift warning.

Postgres
  Uses advisory lock for bootstrap serialization.

SQLite
  Uses per-engine asyncio.Lock in process.
  Cross-process is best-effort via SQLite file lock + busy_timeout=30000.
```

Schema migration/bootstrap and runtime store consistency are separate questions. The split-brain issue below is about Store/checkpointer/application persistence not all consuming one resolved persistence profile.

## Current Split-brain Risk

当前代码已经引入 `database` 作为统一配置，目标是同时约束 checkpointer 和 DeerFlow 应用数据：

```text
database.backend = memory | sqlite | postgres
```

但启动路径还没有完全统一：

```text
make_checkpointer(config)
  支持 legacy checkpointer
  也支持新的 database

make_store(config)
  只读取 legacy checkpointer
  如果没有 checkpointer，就退回 InMemoryStore
```

这意味着只配置 `database.sqlite` 或 `database.postgres` 时：

```text
checkpointer
  可能是持久化的。

RunRepository / ThreadMetaRepository / DbRunEventStore
  可能是 SQL 持久化的。

LangGraph Store
  可能仍是 InMemoryStore。
```

这是一处真实的 split-brain 风险：同一次 Gateway 启动里，有些状态按新的 unified database 持久化，有些状态仍按旧 `checkpointer` section 决定。对只依赖 checkpoint 的对话恢复影响有限，但对 LangGraph Store 中的长期 KV 状态、memory fallback、未来扩展会造成语义不一致。

同类问题也出现在 sync provider：`get_checkpointer()` / `get_store()` 主要读取 legacy `checkpointer` singleton，尚未按新的 `database` 统一入口完成迁移。

## Design Tradeoffs

### Several stores reduce coupling, but increase recovery complexity

把 graph state、run row、event stream、thread metadata 分开是合理的：它们查询方式和生命周期不同。代价是恢复语义必须写清楚，否则用户会以为“数据库持久化”意味着所有东西都能恢复。

### RunManager keeps cancellation local

取消需要 `asyncio.Task` 和 `abort_event`，只能在当前进程内完成。持久化 run row 能让别的请求看到 run 状态，但不能让另一个进程取消本进程里的任务。

### Event store is query-oriented, not execution-authoritative

Run events 很适合前端消息、调试和审计，但不能当作恢复图状态的来源。图状态仍以 checkpointer 为准。

### Startup-only config is necessary but easy to misunderstand

数据库连接池、checkpointer、store、run event store 都在 Gateway 启动时绑定配置。请求时热加载到的新 config 不会重建这些资源。代码已经用 reload boundary 解释这一点，但用户配置体验仍容易误解。

## Risks

- `make_store()` 尚未跟 `database` 配置统一，可能导致 checkpointer 持久化而 Store 仍在内存。
- sync checkpointer/store provider 仍偏 legacy `checkpointer` section，和 Gateway async path 不完全一致。
- `run_events.backend="db"` 且 `database.backend="memory"` 时会回退到 memory，最好在启动时显式报配置错误或警告。
- 后续新表/新列需要继续通过 schema bootstrap / Alembic migration 维护。
- startup orphan recovery 目前只在 sqlite 分支执行，postgres / 多 worker 场景需要更明确的 worker ownership 和 lease 设计。
- Thread metadata 和 checkpoint 之间存在同步关系，例如 title 从 checkpoint 同步到 `threads_meta.display_name`，同步失败会造成列表页和 state 页短暂不一致。
- `RunJournal` 通过 callback 捕获事件，部分 flush 是 best-effort；事件流不能被当作强一致执行日志。

## Code Reading Focus

```text
app.gateway.deps.langgraph_runtime()
app.gateway.services.start_run()
deerflow.runtime.runs.worker.run_agent()
deerflow.runtime.runs.manager.RunManager
deerflow.runtime.journal.RunJournal
deerflow.runtime.checkpointer.async_provider.make_checkpointer()
deerflow.runtime.store.async_provider.make_store()
deerflow.runtime.events.store.make_run_event_store()
deerflow.persistence.bootstrap.bootstrap_schema()
deerflow.persistence.engine.init_engine_from_config()
deerflow.persistence.run.sql.RunRepository
deerflow.persistence.thread_meta.sql.ThreadMetaRepository
deerflow.runtime.events.store.db.DbRunEventStore
deerflow.runtime.serialization.serialize_channel_values_for_api()
app.gateway.routers.threads.get_thread_state()
app.gateway.routers.threads.get_thread_history()
```
