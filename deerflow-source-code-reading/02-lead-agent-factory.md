# Lead Agent Factory

## One-line Mental Model

`make_lead_agent()` is the compatibility adapter. `_make_lead_agent()` is the real assembly line that turns runtime options and `AppConfig` into a LangGraph-backed lead-agent graph.

## System Position

Upstream:

- DeerFlow Gateway `run_agent()`
- official LangGraph Server / Studio / CLI through `backend/langgraph.json`
- embedded client paths

Downstream:

- `create_chat_model()`
- `get_available_tools()`
- `build_middlewares()`
- `apply_prompt_template()`
- LangChain `create_agent()`

Registered LangGraph-compatible entry:

```json
{
  "graphs": {
    "lead_agent": "deerflow.agents:make_lead_agent"
  }
}
```

Gateway does not primarily enter through `langgraph.json`; it imports and calls the same factory directly.

## Main Flow

```text
make_lead_agent(config)
  -> _get_runtime_config(config)
  -> resolve app_config
  -> _make_lead_agent(config, app_config=...)

_make_lead_agent(config, app_config)
  -> parse runtime options
  -> load custom agent config
  -> resolve final model
  -> write metadata
  -> attach tracing callbacks
  -> load skills for tool policy
  -> build tools
  -> build middleware
  -> build system prompt
  -> create_agent(...)
```

Final output:

```text
Compiled LangGraph agent graph
```

It is later executed by:

```python
agent.astream(graph_input, config=runnable_config, stream_mode=...)
```

## `make_lead_agent()`

This public function keeps a single-argument signature:

```python
def make_lead_agent(config: RunnableConfig):
```

That shape is important because LangGraph Server expects graph factories to be callable from a config-only entry.

It resolves `AppConfig` like this:

```text
1. Prefer runtime-injected app_config.
2. Fall back to get_app_config().
```

This is compatibility glue. `AppConfig` is application-level configuration, not really run context, but passing it through runtime config lets embedded/Gateway paths inject a hot-loaded snapshot while preserving the LangGraph Server ABI.

## `_make_lead_agent()`

Signature:

```python
def _make_lead_agent(config: RunnableConfig, *, app_config: AppConfig):
```

The `*` makes `app_config` keyword-only:

```python
_make_lead_agent(config, app_config=my_config)
```

This avoids ambiguous positional calls, especially because both parameters are "config-like".

The function begins with lazy imports:

```python
from deerflow.tools import get_available_tools
from deerflow.tools.builtins import setup_agent, update_agent
```

This avoids circular import risk between agent assembly, tools, subagents, and runtime modules.

## Runtime Options

`_get_runtime_config()` merges:

```text
config["configurable"]
config["context"]
```

The merge is not a mathematical union. It is:

```text
start with configurable
then context overwrites same-name keys
```

Core fields read by `_make_lead_agent()`:

```text
model_name / model
thinking_enabled
reasoning_effort
is_plan_mode
subagent_enabled
max_concurrent_subagents
is_bootstrap
agent_name
```

These are per-run options, not global app settings.

## Model Resolution

Model priority:

```text
request model_name
  > custom agent config model
  > AppConfig.models[0]
```

The requested model name is matched against `AppConfig.models`.

```text
cfg.model_name
  = this run's selected model name

app_config.models
  = allowed model registry and provider configuration
```

If `thinking_enabled=True` but the selected model does not support thinking:

```text
log warning
set thinking_enabled=False
```

## Custom Agent and Bootstrap Modes

Normal default agent:

```text
agent_name = None
is_bootstrap = False
```

Existing custom agent:

```text
agent_name = "some-agent"
is_bootstrap = False
```

Bootstrap mode:

```text
is_bootstrap = True
```

Bootstrap is a temporary creation/setup flow for custom agents. It exposes `setup_agent`.

Existing custom-agent chat exposes `update_agent` when `agent_name` is set.

Lifecycle:

```text
bootstrap flow
  -> setup_agent
  -> creates custom agent SOUL.md / config.yaml

normal custom-agent chat
  -> update_agent
  -> updates existing custom agent
```

## Metadata

`_make_lead_agent()` writes run metadata into `config["metadata"]`:

```text
agent_name
model_name
thinking_enabled
reasoning_effort
is_plan_mode
subagent_enabled
tool_groups
available_skills
```

This supports tracing, run journal attribution, debugging, and subagent inheritance of parent restrictions.

## Tracing

Tracing callbacks are attached at the graph invocation root:

```text
config["callbacks"] += build_tracing_callbacks()
```

Then in-graph model creation passes:

```python
attach_tracing=False
```

This avoids duplicate tracing spans and keeps Langfuse/LangSmith trace attributes attached to the root run.

## Final Agent Formula

Normal path:

```python
create_agent(
    model=create_chat_model(...),
    tools=filtered_tools,
    middleware=build_middlewares(...),
    system_prompt=apply_prompt_template(...),
    state_schema=ThreadState,
)
```

Mental model:

```text
Lead Agent Graph =
  model
  + tools
  + middleware
  + system_prompt
  + ThreadState
```

`create_agent()` provides the standard LangGraph model/tool loop. DeerFlow provides the materials and policies.

## State and Config

Reads:

- `RunnableConfig.configurable`
- `RunnableConfig.context`
- `AppConfig.models`
- `AppConfig.summarization`
- `AppConfig.title`
- `AppConfig.memory`
- `AppConfig.tool_search`
- `AppConfig.loop_detection`
- `AppConfig.safety_finish_reason`
- custom agent config
- enabled skills

Writes:

- `config["metadata"]`
- `config["callbacks"]`

Returns:

- compiled agent graph

Does not directly execute the graph.

## Side Effects

- Dynamic imports tools to avoid circular dependencies.
- Reads custom agent config and SOUL prompt.
- Loads enabled skills for prompt and tool policy.
- Builds tracing callbacks.
- May log model fallback and configuration warnings.

## Design Tradeoffs

`make_lead_agent()` is intentionally a compatibility boundary. It is not perfectly clean architecture because it supports multiple hosts:

```text
official LangGraph Server / Studio
DeerFlow Gateway
embedded client
tests
legacy configurable
newer context
```

This explains the awkwardness around `app_config` being retrievable from runtime config with a global fallback.

`_make_lead_agent()` is cleaner: it receives an explicit `AppConfig` and performs deterministic assembly from runtime options plus application config.

## Risks

`cfg` is an overloaded name. It contains per-run options and may also contain infrastructure fields like `app_config`, `thread_id`, or `run_id`.

`config` is mutated in place by adding metadata and callbacks.

The bootstrap/custom-agent split is easy to confuse:

```text
setup_agent
  bootstrap only

update_agent
  existing custom agent only
```

Middleware order is assembled elsewhere but is part of the final graph behavior. Agent factory changes can unintentionally affect runtime semantics.

## Code Reading Focus

Read:

- `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
  - `make_lead_agent()`
  - `_make_lead_agent()`
  - `_get_runtime_config()`
  - `_resolve_model_name()`
  - `build_middlewares()` only at a high level for now
- `backend/langgraph.json`
  - graph registration compatibility

