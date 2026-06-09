# DeerFlow Source Code Reading Map

This tutorial series is a source-code walkthrough for engineers who are new to large agent systems.

The goal is not to read every line. The goal is to build a durable mental model of how DeerFlow connects request handling, LangGraph execution, tools, middleware, sandboxing, subagents, skills, and persistence.

## Reading Principles

For each module, read in this order:

1. Build the module mental model.
2. Identify upstream callers and downstream dependencies.
3. Trace the main runtime path.
4. Read only the core functions.
5. Record state/config changes and side effects.
6. Capture design tradeoffs and risks.

## Module Note Template

Each module note should follow this structure:

```text
One-line mental model
  Why this module exists.

System position
  Who calls it?
  What does it call?

Main flow
  The 3-7 core steps in a real run.

Core objects
  Key functions/classes, limited to the important few.

State and config
  What AppConfig, RunnableConfig, Runtime.context, and ThreadState fields are read or written?

Side effects
  Files, database, network, model calls, sandbox, MCP, ACP, background tasks.

Design tradeoffs
  Why the design is shaped this way.

Risks
  Compatibility debt, security boundaries, confusing naming, ordering dependencies.

Code reading focus
  The exact source files and functions worth reading.
```

## Planned Route

1. Request entry and agent main chain
2. Lead agent factory
3. Tools assembly
4. Middleware pipeline
5. Sandbox system
6. Subagent system
7. Skills system
8. Persistence, store, checkpointer, and run events

## Current Mental Model

DeerFlow uses LangGraph as the agent execution kernel, but its primary application runtime is the DeerFlow Gateway. The Gateway accepts HTTP requests, manages threads/runs/streams/persistence, then builds and runs a LangGraph-backed agent graph through `make_lead_agent()`.

```text
Frontend / API
  -> DeerFlow Gateway
  -> RunManager / run_agent()
  -> make_lead_agent(config)
  -> _make_lead_agent(config, app_config)
  -> create_agent(...)
  -> agent.astream(...)
  -> LangGraph runtime
```

`make_lead_agent()` is a compatibility adapter. `_make_lead_agent()` is the real lead-agent assembly function.

