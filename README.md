<p align="center">
  <img src="./assets/readme-cover.svg" alt="DeerFlow Engineering Notes — one main line from a prompt to an agent run" width="100%" />
</p>

<h1 align="center">DeerFlow Engineering Notes</h1>

<p align="center">
  Reading <a href="https://github.com/bytedance/deer-flow">DeerFlow</a>'s Python agent runtime through the path a request follows —
  from user input to a managed agent run.
</p>

---

This is a source-reading tutorial for DeerFlow's Python agent runtime. It does
not tour folders one by one. It follows the main product path: a user request is
accepted by the Gateway, becomes a managed **run**, enters the lead-agent graph,
receives a tool surface, passes through middleware, executes tools in a sandbox,
delegates work to subagents, loads skills, and leaves recoverable runtime records.

The goal is to make DeerFlow understandable as an engineering system, beyond
a collection of agent tricks. Every article pairs a plain-language explanation
with source anchors pinned to the exact upstream commit it describes.

## Who this is for

These notes are for readers who want to understand how an industrial agent
project is put together:

- You can read Python and want a guided path through the runtime.
- You are new to DeerFlow and do not know where to start.
- You want to understand run lifecycle, tools, middleware, sandboxing,
  subagents, skills, and persistence as one connected system.
- You prefer source-backed explanations over architecture slogans.

This is not a replacement for the official repository. It is a map for reading it.
For the full picture — code, issues, roadmap, and actual development — go to:

> **→ [bytedance/deer-flow](https://github.com/bytedance/deer-flow)**

## What This Tutorial Teaches

The main idea is simple: an agent product is more than "send a prompt to a model".
DeerFlow has to host long-running work, decide which tools are available, prepare
runtime context, gate tool execution, isolate external side effects, delegate
subtasks, load reusable skills, and persist the right state after the process exits.

The tutorial follows those responsibilities in the order a run encounters them.

## Reading path

1. **Request entry** — how Gateway hosts user input as a managed run.
2. **Lead-agent factory** — how runtime config becomes a runnable agent graph.
3. **Tool assembly** — why registered tools are not automatically available to a run.
4. **Middleware pipeline I** — how DeerFlow prepares context before model calls.
5. **Middleware pipeline II** — how model output is adjudicated, gated, and cleaned up.
6. **Sandbox system** — where tools execute, and why local and container sandboxes are not the same boundary.
7. **Subagent system** — how complex subtasks are delegated to constrained full agents.
8. **Skill system** — how experience becomes installable, reviewable, reusable agent capability.
9. **Persistence, store, and checkpointer** — what can resume, what can be queried, and what can be audited.

If you are new to DeerFlow, read in order. Later chapters assume the run, tool,
middleware, and sandbox boundaries introduced earlier.

## Source baseline

All current articles are aligned to the pinned upstream commit
[`7e7f0410`](https://github.com/bytedance/deer-flow/commit/7e7f0410). Each article pins that
commit in frontmatter, and every source reference is checked against the pinned upstream code
so the prose matches the implementation it explains. When DeerFlow moves again, outdated
explanations should be revised first, then re-pinned.

## Local preview

```bash
cd site
pnpm install
pnpm dev
```

The site normally runs at:

```text
http://127.0.0.1:4321/
```

To verify the content, source anchors, build, and generated routes:

```bash
cd site
pnpm check
```

## Repository layout

```text
site/      Astro + MDX blog (the canonical public version)
notes/     source-reading notes and design observations kept for traceability
assets/    README artwork and repo-level visuals
```

## Notes vs. site

The `site/` directory is the public reading experience. The `notes/` directory is
the working notebook behind it: source-reading notes, design observations, and
rougher material kept so the polished tutorial can stay traceable.

## Status & contributing

These are personal study notes, kept public so others can read along. They are
not official DeerFlow documentation and do not collect product feature requests.

- Want to improve the upstream system? Contribute to **[bytedance/deer-flow](https://github.com/bytedance/deer-flow)** — that's where product changes land.
- Spotted a wrong explanation, an awkward translation, or a broken source anchor *here*? An issue is genuinely welcome.
