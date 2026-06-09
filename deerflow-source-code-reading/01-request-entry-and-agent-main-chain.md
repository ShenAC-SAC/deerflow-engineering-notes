# Request Entry and Agent Main Chain

## One-line Mental Model

DeerFlow Gateway is the application runtime host. It receives LangGraph-compatible HTTP requests, manages run lifecycle, then builds and streams a LangGraph-backed agent graph.

## System Position

Upstream:

- Frontend LangGraph SDK calls
- IM channel workers
- External clients using LangGraph-compatible endpoints

Downstream:

- `RunManager`
- `StreamBridge`
- `run_agent()`
- `make_lead_agent()`
- LangGraph `agent.astream()`

The important distinction:

```text
LangGraph
  = execution kernel used by DeerFlow agents

LangGraph Server
  = optional official HTTP server/runtime

DeerFlow Gateway
  = current primary HTTP runtime, compatible with LangGraph API
```

`backend/langgraph.json` still registers `lead_agent` for LangGraph Server/Studio/CLI compatibility, but Gateway imports and calls the factory directly on the main path.

## Main Flow

Gateway streaming path:

```text
POST /api/threads/{thread_id}/runs/stream
  -> stream_run()
  -> start_run()
  -> RunManager.create_or_reject()
  -> resolve_agent_factory()
  -> build_run_config()
  -> merge_run_context_overrides()
  -> asyncio.create_task(run_agent(...))
  -> sse_consumer()
```

Background worker path:

```text
run_agent()
  -> mark run running
  -> publish metadata
  -> build Runtime(context=...)
  -> RunnableConfig(**config)
  -> agent_factory(config=runnable_config)
  -> make_lead_agent(config)
  -> create_agent(...)
  -> attach checkpointer/store
  -> agent.astream(...)
  -> publish chunks to StreamBridge
  -> mark final run status
  -> publish end sentinel
```

## Core Objects

`RunCreateRequest`

HTTP request model for creating or streaming a run.

Important fields:

```text
assistant_id
input
config
context
metadata
stream_mode
stream_subgraphs
interrupt_before / interrupt_after
multitask_strategy
on_disconnect
```

`RunManager`

Owns run lifecycle:

```text
create_or_reject
set_status
cancel
update progress
persist run metadata
```

`StreamBridge`

Decouples background graph execution from HTTP SSE consumption.

```text
run_agent() publishes events
sse_consumer() reads events and formats SSE frames
```

`run_agent()`

The execution worker. It is not the agent itself; it hosts and drives the graph.

`make_lead_agent()`

Factory that returns the compiled agent graph.

## RunnableConfig Construction

Gateway builds a `RunnableConfig`-shaped dict in `build_run_config()`.

Main responsibilities:

1. Always attach `thread_id`.
2. Preserve caller-provided `config`.
3. Inject `agent_name` when `assistant_id` refers to a custom agent.
4. Merge request `context` fields into both `configurable` and `context`.
5. Attach metadata.

Important compatibility rule:

```text
config["configurable"]
  = legacy runtime options channel

config["context"]
  = newer LangGraph runtime context channel

DeerFlow writes key fields to both in Gateway compatibility mode.
```

Whitelisted context fields include:

```text
model_name
mode
thinking_enabled
reasoning_effort
is_plan_mode
subagent_enabled
max_concurrent_subagents
agent_name
is_bootstrap
```

## Runtime Context

`run_agent()` creates a LangGraph `Runtime` and installs it into config:

```text
runtime.context:
  thread_id
  run_id
  user_id
  app_config
  __run_journal

config["configurable"]["__pregel_runtime"]:
  Runtime(context=..., store=...)
```

This gives middleware and tools access to run-scoped data through LangGraph runtime APIs.

## State and Config

Reads:

- HTTP body `input/config/context/metadata`
- authenticated user
- app-level runtime dependencies from FastAPI app state

Writes:

- run records
- thread metadata
- runtime context
- stream events
- checkpoint rollback snapshots
- final run completion metadata

Does not directly mutate agent `ThreadState`; graph execution does that.

## Side Effects

- Creates background asyncio task.
- Publishes SSE events.
- Writes run status/progress.
- Reads/writes checkpointer snapshots for rollback.
- Syncs generated title from checkpoint to thread metadata.
- Flushes run journal events.

## Design Tradeoffs

Gateway reimplements a LangGraph-compatible API instead of relying solely on official LangGraph Server. This lets DeerFlow own:

```text
auth
thread/run metadata
run event store
SSE bridge
rollback
frontend compatibility
hot-reload boundaries
application-specific persistence
```

The cost is compatibility glue: request fields must be translated into LangGraph-flavored config, stream modes must be mapped, and runtime context must be installed manually.

## Risks

`configurable` vs `context` is historical compatibility debt. If a field is only written to one place, older DeerFlow code or newer LangGraph `ToolRuntime.context` consumers may miss it.

`run_agent()` is an orchestration-heavy function. It mixes graph invocation, persistence, stream publishing, rollback, tracing, and cleanup. This is powerful but dense.

Gateway uses background tasks. Disconnect, cancellation, rollback, and final checkpoint serialization must be handled carefully to avoid returning partial state as success.

## Code Reading Focus

Read these files:

- `backend/app/gateway/routers/thread_runs.py`
  - `RunCreateRequest`
  - `stream_run()`
  - `wait_run()`
- `backend/app/gateway/services.py`
  - `start_run()`
  - `build_run_config()`
  - `merge_run_context_overrides()`
  - `resolve_agent_factory()`
  - `sse_consumer()`
- `backend/packages/harness/deerflow/runtime/runs/worker.py`
  - `run_agent()`
  - `_build_runtime_context()`
  - `_install_runtime_context()`

