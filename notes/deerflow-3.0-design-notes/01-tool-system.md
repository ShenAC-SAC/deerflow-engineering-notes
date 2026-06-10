# DeerFlow 3.0 Design Notes: Tool System

This note is maintained separately from the source-code reading tutorial. It records 3.0 design observations discovered while reading the DeerFlow 2.x Python implementation.

## Current 2.x Shape

In 2.x, `get_available_tools()` builds the tool list for one agent run:

```text
config tools
+ built-in tools
+ subagent tools
+ vision tools
+ MCP tools
+ ACP tools
-> sync/async compatibility wrapping
-> dedupe by tool.name
-> create_agent(tools=...)
```

This works, but several responsibilities are mixed into one assembly function:

- tool discovery
- config filtering
- runtime capability gating
- security policy
- MCP cache access
- subagent enablement
- compatibility wrapping
- duplicate-name conflict handling

## Key 2.x Lessons

### Built-In Tools Are Not All The Same

Some built-ins execute normal work:

```text
present_files
-> validates file path
-> returns LangGraph Command
-> updates ThreadState.artifacts and messages
```

Some built-ins are signal tools:

```text
ask_clarification
-> exposes a tool schema to the model
-> actual behavior is intercepted by ClarificationMiddleware
-> emits a ToolMessage and ends the current graph run
```

So "tool" currently means multiple things:

- executable capability
- user-interaction signal
- state mutation command
- delegation entry point
- external integration wrapper

3.0 should make these categories explicit.

### Subagent Is A Capability, Not Just A Tool

In 2.x, subagent access is enabled by appending `task_tool` when `subagent_enabled=True`.

That is simple, but semantically weak:

```text
task_tool present in tool list == parent agent may delegate to subagents
```

For 3.0, subagent access should likely be modeled as an agent capability:

```text
AgentCapabilities {
  subagents: enabled | disabled
  allowedSubagents: string[]
  nestingPolicy: none | limited | recursive
}
```

Then tool exposure can be derived from policy, instead of using tool-list mutation as the source of truth.

### MCP Cache Is Runtime Infrastructure

In 2.x, MCP tools are cached globally after loading from enabled MCP servers. The cache avoids reconnecting and rebuilding tool objects for every agent run.

The cache also watches extension config file mtime and resets when the config changes.

This solves practical startup/runtime issues, but the config source is mixed:

- `AppConfig` may be passed as a runtime snapshot.
- `ExtensionsConfig.from_file()` is read directly inside tool assembly for hot updates.

For 3.0, this should be made explicit:

```text
ToolCatalogSnapshot {
  appConfigVersion
  extensionsConfigVersion
  tools
  mcpServers
  generatedAt
}
```

The agent builder should consume a snapshot, not perform hidden file reads.

## Proposed 3.0 Split

### Tool Registry

Owns what tools exist.

```text
ToolRegistry
-> built-in tools
-> sandbox tools
-> MCP tools
-> ACP tools
-> skill tools
```

It should answer:

```text
What capabilities are registered in the system?
What is each tool's name, schema, provider, tags, and execution type?
```

### Tool Policy

Owns what this run may use.

```text
ToolPolicy
-> model capability filtering
-> user/workspace permission filtering
-> custom agent tool group filtering
-> skill allowed_tools filtering
-> sandbox safety filtering
-> subagent nesting limits
```

It should answer:

```text
Which registered tools are exposed to this agent run?
Why was a tool included or excluded?
```

In 2.x, this policy is already present but split across several places:

```text
tools.py
  -> tool_groups
  -> host bash safety
  -> model supports_vision

skills/tool_policy.py
  -> skill allowed_tools

task_tool.py
  -> subagent_enabled=False for child agents
  -> bash subagent safety

tool_search / deferred middleware
  -> MCP tools may require promotion before use
```

The important design lesson is that "tool policy" should not be a single list
filter hidden in one module. It is a run-scoped decision system with multiple
inputs:

```text
agent config
skill config
model capability
sandbox mode
user/workspace permission
runtime mode
external tool source
```

For 3.0, a first-class policy result would be useful:

```text
ToolPolicyResult {
  exposedTools
  deferredTools
  deniedTools: Array<{ name, reason }>
  warnings
}
```

This would make debugging much easier than asking "why did this tool disappear
from list[BaseTool]?"

### Tool Runtime

Owns how tools execute.

```text
ToolRuntime
-> async execution
-> timeout
-> cancellation
-> sandbox binding
-> user interaction interrupt
-> event streaming
-> audit logging
-> error normalization
```

It should answer:

```text
How does this tool call actually run?
How are results, errors, interrupts, and state updates represented?
```

## Design Goal

The 3.0 tool system should avoid using `list[BaseTool]` as the only source of truth.

The better mental model:

```text
registered capabilities
-> policy-filtered exposed tools
-> runtime-executed tool calls
-> state/events/checkpoints
```

This keeps LangChain/LangGraph compatibility as an adapter layer, instead of letting framework tool objects define DeerFlow's core architecture.
