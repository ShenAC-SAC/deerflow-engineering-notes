<p align="center">
  <img src="./assets/readme-cover.svg" alt="DeerFlow Engineering Notes cover" width="100%" />
</p>

<h1 align="center">DeerFlow Engineering Notes</h1>

<p align="center">
  Source-reading notes for the DeerFlow 2.0 Python runtime: from one prompt, through the gateway, into the agent graph.
</p>

<p align="center">
  <a href="https://shenac-sac.github.io/deerflow-engineering-notes/"><strong>Read the site</strong></a>
  ·
  <a href="https://github.com/bytedance/deer-flow">DeerFlow upstream</a>
  ·
  <a href="./site/src/content/tutorials">MDX essays</a>
  ·
  <a href="./notes">source notes</a>
</p>

---

This repository turns DeerFlow's Python runtime into a bilingual engineering
blog. It is not a second API reference. The reading path follows one real
request as it becomes a run, enters the lead-agent factory, receives its tool
capabilities, and continues through the rest of the agent runtime.

中文读者可以直接从站点右上角切到中文版本。这里的目标不是把源码逐行翻译成说明书，而是把 DeerFlow 这种工业级 Agent 项目的主链路讲清楚：请求如何进入系统，图如何装配，工具为什么有时出现、有时被策略挡住。

## Why DeerFlow

[DeerFlow](https://github.com/bytedance/deer-flow) is a real agent system, not a
toy demo. That makes it harder to read, but also more valuable to study:

- gateway-owned run lifecycle, streaming, rollback, and metadata
- LangGraph-compatible graph factories and runtime context
- dynamic tool assembly across built-ins, sandbox tools, skills, MCP, and ACP
- engineering trade-offs around compatibility, least privilege, and state

If you want to learn how agent runtimes behave once they leave the notebook,
DeerFlow is worth reading. This repository is the guided map.

## Reading Path

Published so far:

1. **Request entry**: how a prompt becomes a run.
2. **Lead-agent factory**: how runtime options become a compiled graph.
3. **Tool assembly**: why the tool list is computed, not merely registered.

Planned stops include middleware, sandboxing, subagents, skills, and persistence.
Each article pins its source references to a DeerFlow commit, so the prose and
the code stay connected.

## Run Locally

The Astro site lives in `site/`.

```bash
cd site
pnpm install
pnpm dev
pnpm check
```

`pnpm check` runs content consistency checks, source-anchor checks, Astro build,
and route checks for the bilingual site.

For source-anchor checks outside the original DeerFlow workspace, point
`DEERFLOW_ROOT` at a local clone of `bytedance/deer-flow`:

```bash
DEERFLOW_ROOT=/path/to/deer-flow pnpm check
```

## Repository Layout

```text
site/      Astro + MDX blog
notes/     source material kept for traceability
assets/    README artwork and repo-level visuals
```

`notes/deerflow-source-code-reading/` keeps the original source-reading notes
that the public essays were distilled from. `notes/deerflow-3.0-design-notes/`
keeps forward-looking design observations. Once material is rewritten into
`site/src/content/tutorials/`, the site becomes the canonical public version.

## Contributing

Contributions are welcome, especially:

- wording fixes in either English or Chinese
- source-anchor corrections when DeerFlow evolves
- new stops in the runtime journey
- diagrams or visual explanations that make the system easier to understand

Please keep three rules in mind:

- explain the engineering reason, not only the code path
- pin source references to a DeerFlow commit
- keep the bilingual versions close in meaning, even when the wording is not a literal translation

## License

This repository contains learning notes and blog source. Source references point
to the upstream DeerFlow project at pinned commits.
