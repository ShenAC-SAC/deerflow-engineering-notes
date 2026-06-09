# Tools Assembly

## One-line Mental Model

`tools.py` is the tool registry and assembler. It turns system configuration, runtime switches, MCP/ACP extensions, and built-in DeerFlow capabilities into the final `list[BaseTool]` passed to `create_agent()`.

## System Position

Upstream:

- `_make_lead_agent()` in `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- Embedded `DeerFlowClient` paths that build an agent directly

Downstream:

- LangChain `create_agent(..., tools=...)`
- LangGraph tool node, which executes tool calls emitted by the model

Main call site:

```python
raw_tools = get_available_tools(
    model_name=model_name,
    groups=agent_config.tool_groups if agent_config else None,
    subagent_enabled=subagent_enabled,
    app_config=resolved_app_config,
)
```

## Main Flow

`get_available_tools()` performs these steps:

1. Start from `AppConfig.tools`.
2. Filter by custom-agent `tool_groups`, if provided.
3. Remove host-bash tools unless the sandbox/security config explicitly allows them.
4. Dynamically import configured tools via `resolve_variable(cfg.use, BaseTool)`.
5. Add DeerFlow built-in tools.
6. Add `task_tool` only when `subagent_enabled=True`.
7. Add `view_image_tool` only when the selected model supports vision.
8. Add cached MCP tools when MCP is enabled.
9. Add `invoke_acp_agent` when ACP agents are configured.
10. Deduplicate by `tool.name`.

After this, `_make_lead_agent()` applies skill-level tool policy:

```python
filter_tools_by_skill_allowed_tools(tools, skills_for_tool_policy)
```

So the effective flow is:

```text
config tools + built-ins + MCP + ACP
  -> tool_groups filter
  -> host bash safety filter
  -> runtime capability switches
  -> name dedupe
  -> skill allowed_tools filter
  -> create_agent(tools=...)
```

## Core Objects

`ToolConfig`

Defined in `backend/packages/harness/deerflow/config/tool_config.py`.

```python
class ToolConfig(BaseModel):
    name: str
    group: str
    use: str
```

`ToolGroupConfig`

```python
class ToolGroupConfig(BaseModel):
    name: str
```

`AppConfig`

Defined in `backend/packages/harness/deerflow/config/app_config.py`.

```python
tools: list[ToolConfig]
tool_groups: list[ToolGroupConfig]
```

`AgentConfig`

Defined in `backend/packages/harness/deerflow/config/agents_config.py`.

```python
tool_groups: list[str] | None = None
```

This is the custom-agent tool group whitelist.

## Config Shape

System tool groups and tools are configured in `config.yaml`:

```yaml
tool_groups:
  - name: web
  - name: file:read
  - name: file:write
  - name: bash

tools:
  - name: web_search
    group: web
    use: deerflow.community.ddg_search.tools:web_search_tool

  - name: read_file
    group: file:read
    use: deerflow.sandbox.tools:read_file_tool

  - name: write_file
    group: file:write
    use: deerflow.sandbox.tools:write_file_tool

  - name: bash
    group: bash
    use: deerflow.sandbox.tools:bash_tool
```

The group membership is declared on each tool through `tools[*].group`. `tool_groups` declares the available group names.

## Dynamic Import

The `use` field is not Python syntax. It is a DeerFlow configuration convention:

```text
module.path:variable_name
```

Example:

```text
deerflow.sandbox.tools:read_file_tool
```

`resolve_variable()` parses it like this:

```python
module_path, variable_name = variable_path.rsplit(":", 1)
module = import_module(module_path)
variable = getattr(module, variable_name)
```

Then `resolve_variable(cfg.use, BaseTool)` validates:

```python
isinstance(variable, BaseTool)
```

The variable name can be anything, as long as it exists in the target module and resolves to a `BaseTool` instance. This variable name is different from `tool.name`, which is the name exposed to the model and tool router.

## State and Config

Reads:

- `AppConfig.tools`
- `AppConfig.models`
- `AppConfig.skill_evolution`
- `AppConfig.acp_agents`
- `AppConfig.tool_search`
- custom-agent `agent_config.tool_groups`
- runtime `subagent_enabled`
- runtime `model_name`

Writes:

- No LangGraph `ThreadState` writes.
- Mutates async-only tools by attaching a sync wrapper when needed.
- Tags MCP tools with metadata so deferred-tool logic can identify them later.

## Side Effects

- Imports Python modules dynamically.
- Reads latest MCP extension configuration from disk through `ExtensionsConfig.from_file()`.
- May lazily initialize or read cached MCP tools.
- Builds ACP invocation tool if ACP agents exist.
- Logs name mismatches and duplicate tools.

## Design Tradeoffs

The module deliberately separates tool sources from final tool policy.

`get_available_tools()` answers:

```text
What tools can this agent candidate see from system config and runtime switches?
```

`filter_tools_by_skill_allowed_tools()` answers:

```text
After skills are loaded, which tools are still allowed?
```

This two-stage design lets tool availability be controlled by both agent-level configuration and skill-level least-privilege policy.

## Risks

Dynamic import is flexible but can fail late at runtime if config paths are wrong or optional dependencies are missing.

Tool names have two layers:

```text
config name: cfg.name
runtime tool name: loaded.name
```

If they diverge, the model may see one schema name while the runtime routes by another. DeerFlow warns about this mismatch.

Host bash is a major security boundary. It is filtered even if present in `config.yaml` unless `is_host_bash_allowed(config)` returns true.

MCP tools have a special freshness path. `get_available_tools()` receives `app_config`, but MCP extensions are read again from disk to avoid stale extension configuration across processes.

## Representative Tool Implementation Patterns

Do not try to fully understand every tool at this stage. The useful learning goal is to recognize the major implementation patterns.

### Normal Execution Tool

Most tools are ordinary LangChain `BaseTool` objects created with `@tool`:

```python
@tool("some_tool", parse_docstring=True)
def some_tool(arg: str) -> str:
    ...
```

The decorator turns the function signature and docstring into:

```text
tool.name
tool.description
tool.args_schema
tool.func or tool.coroutine
```

The model sees the schema. The runtime executes the underlying function when the model emits a matching `tool_call`.

### State-Updating Tool

`present_files` is a representative state-updating tool.

It returns a LangGraph `Command`:

```python
return Command(
    update={
        "artifacts": normalized_paths,
        "messages": [ToolMessage("Successfully presented files", tool_call_id=tool_call_id)],
    },
)
```

This means the tool result is not only text. It can directly update graph state. In this case it updates:

```text
ThreadState.artifacts
ThreadState.messages
```

The frontend later uses artifacts to show downloadable/renderable files.

### Control-Flow Tool

`ask_clarification` is not really implemented by its function body.

The tool function only exposes a schema to the model. The actual behavior is implemented by `ClarificationMiddleware`:

```text
model emits ask_clarification tool_call
-> ClarificationMiddleware intercepts it
-> creates a ToolMessage containing the question
-> returns Command(update=..., goto=END)
-> current run stops
-> frontend/channel treats the ToolMessage as pending clarification
-> user's answer comes back as a new HumanMessage in the same thread
```

This is an important Agent engineering pattern:

```text
user interaction should be modeled as an interrupt,
not as a blocking tool function waiting for input.
```

### Delegation Tool

`task_tool` is the subagent entry point:

```text
model emits task(description, prompt, subagent_type)
-> task_tool resolves subagent config
-> inherits parent sandbox/thread/model/tool policy context
-> builds subagent tools with subagent_enabled=False
-> starts SubagentExecutor in the background
-> streams task_started/task_running/task_completed events
-> returns the subagent result to the parent agent as a tool result
```

The current 2.x implementation exposes subagent capability by conditionally appending `task_tool` to the tool list. This works, but the semantics are weak: the presence of one tool becomes the capability switch for delegation.

For 3.0, subagent access should probably become explicit agent capability policy rather than only list mutation.

## MCP Cache

MCP tools are not imported from local Python modules. They are discovered from enabled MCP servers and converted into LangChain `BaseTool` objects.

The cache stores the loaded MCP tool list:

```python
_mcp_tools_cache: list[BaseTool] | None = None
```

The goal is to avoid reconnecting to MCP servers and rebuilding tool objects on every agent run.

The cache also tracks the extension config file modification time:

```text
if extensions config mtime changed
-> reset MCP tool cache
-> reload tools next time
```

This is practical, but it mixes config snapshot semantics with direct file reads. That is a useful 3.0 design lesson.

## Deduplication

The final dedupe logic uses two containers:

```python
seen_names: set[str] = set()
unique_tools: list[BaseTool] = []
```

`seen_names` is only for fast membership checks.

`unique_tools` preserves the actual `BaseTool` objects and their order.

The priority order is:

```text
config-loaded tools
-> built-ins
-> MCP tools
-> ACP tools
```

If two tools share the same `tool.name`, the earlier one wins and the later one is skipped.

This matters because tool routing is name-based. Duplicate names can make the model/tool schema ambiguous and cause runtime routing errors.

## Deferred Tools And Tool Search

Deferred tools are a bridge between tool assembly, prompt rendering, graph state, and middleware.

Why defer tools?

```text
MCP servers can expose many tools.
Binding every MCP tool schema to the model immediately increases prompt size,
cost, and tool-selection noise.
```

The 2.x design keeps MCP tools executable by the runtime, but hides their schemas
from the model until the agent explicitly searches for them.

### Assembly

`assemble_deferred_tools(filtered, enabled=...)` runs after skill policy filtering.

```text
filtered tools
-> find MCP tools by is_mcp_tool(t)
-> build DeferredToolCatalog
-> build tool_search tool
-> return final_tools and DeferredToolSetup
```

`DeferredToolSetup` contains:

```text
tool_search_tool
deferred_names
catalog_hash
```

The setup is passed to three places:

```text
create_agent(tools=final_tools)
build_middlewares(..., deferred_setup=setup)
apply_prompt_template(..., deferred_names=setup.deferred_names)
```

### Prompt

The system prompt gets:

```text
<available-deferred-tools>
tool_a
tool_b
</available-deferred-tools>
```

The model sees the names, but not the full schemas.

### Promotion State

When the model calls `tool_search`, it searches the deferred catalog and returns
matched schemas. It also writes graph state:

```python
Command(
    update={
        "promoted": {"catalog_hash": catalog_hash, "names": names},
        "messages": [ToolMessage(...)]
    }
)
```

`ThreadState` includes:

```python
promoted: Annotated[PromotedTools | None, merge_promoted]
```

`merge_promoted()` scopes promotion by `catalog_hash`:

```text
same catalog hash -> union names
changed catalog hash -> replace names
```

This prevents a persisted promotion for an old tool catalog from exposing a
different tool after MCP configuration changes.

### Middleware Enforcement

`DeferredToolFilterMiddleware` uses the setup and graph state.

Before model calls:

```text
request.tools
-> remove deferred tools that are not promoted
-> model only receives active schemas
```

Before tool execution:

```text
if model calls a deferred tool that has not been promoted
-> return ToolMessage(status="error")
-> tell model to call tool_search first
```

So the full deferred loop is:

```text
MCP tool tagged
-> assemble_deferred_tools builds catalog and tool_search
-> prompt lists deferred tool names
-> model calls tool_search
-> tool_search writes state.promoted
-> middleware allows promoted tool schema/call
```

This is one of the clearest examples of DeerFlow spreading one feature across:

```text
tool metadata
tool assembly
system prompt
ThreadState
middleware
LangGraph Command
```

## When To Stop Reading This Module

For this stage, the module is sufficiently understood when these points are clear:

- `get_available_tools()` assembles tool visibility for one agent run.
- Tools can come from config, built-ins, MCP, ACP, subagent, and later skill policy.
- `@tool` converts a Python function into a LangChain `BaseTool`.
- Some tools return plain text; some return `Command` and mutate graph state.
- Middleware can intercept tool calls before execution.
- Subagent delegation is exposed through `task_tool`.
- MCP tools are cached because they come from external servers.
- Deferred MCP tools require `tool_search` promotion before their schemas are exposed.
- Final tool identity is `tool.name`, not necessarily `config.tools[*].name`.

Detailed tool internals should be deferred to their own modules:

- clarification details -> middleware chapter
- sandbox tools -> sandbox chapter
- task tool -> subagent chapter
- skill management tool -> skills chapter

## Forgetting Recovery Map

If this module fades from memory, recover it from these anchors instead of
re-reading every line.

### One Sentence

`get_available_tools()` decides which tools are visible to one agent run.

### Inputs

```text
AppConfig.tools
AppConfig.models
AppConfig.skill_evolution
AppConfig.acp_agents
agent_config.tool_groups
model_name
subagent_enabled
skills_for_tool_policy
tool_search.enabled
extensions config for MCP
```

### Output

```text
final_tools -> create_agent(tools=final_tools)
```

### Filtering Chain

```text
config tools
-> custom-agent tool_groups
-> host bash safety
-> model supports_vision
-> skill allowed_tools
-> deferred MCP tool_search
-> dedupe by tool.name
```

### Key Hooks

```text
resolve_variable(cfg.use, BaseTool)
  dynamic import from config path

_is_host_bash_tool()
  identifies bash execution surfaces before import

is_host_bash_allowed(config)
  security gate for host bash exposure

filter_tools_by_skill_allowed_tools()
  skill-level permission narrowing

tag_mcp_tool() / is_mcp_tool()
  runtime metadata for MCP-sourced tools

assemble_deferred_tools()
  builds tool_search and deferred setup

DeferredToolFilterMiddleware
  hides unpromoted deferred tool schemas and blocks unpromoted calls
```

### Representative Tool Types

```text
normal execution:
  read_file, web_search, bash

state update:
  present_files -> Command(update={"artifacts": ...})

control-flow interrupt:
  ask_clarification -> ClarificationMiddleware -> goto END

delegation:
  task -> SubagentExecutor

external integration:
  MCP tools, ACP invoke tool
```

### Most Important Distinction

```text
Tool implementation:
  how a tool actually runs

Tool assembly:
  whether this agent run is allowed to see/call the tool
```

This chapter is mostly about tool assembly. Detailed tool implementations are
better studied when reading their owning modules.

## Code Reading Focus

Read these first:

- `backend/packages/harness/deerflow/tools/tools.py`
  - `get_available_tools()`
  - `_is_host_bash_tool()`
  - `_ensure_sync_invocable_tool()`
- `backend/packages/harness/deerflow/reflection/resolvers.py`
  - `resolve_variable()`
- `backend/packages/harness/deerflow/skills/tool_policy.py`
  - `filter_tools_by_skill_allowed_tools()`
