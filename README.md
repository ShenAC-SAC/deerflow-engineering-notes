# DeerFlow Engineering Notes

Engineering notes and source-reading essays for DeerFlow 2.0 Python internals.

This repository turns DeerFlow's runtime code paths into a bilingual engineering
blog. The main reading path follows one request as it becomes a run, enters the
lead-agent factory, receives its tool capabilities, and continues through the
rest of the agent runtime.

## Site

The Astro site lives in `site/`.

```bash
cd site
pnpm install
pnpm dev
pnpm check
```

`pnpm check` runs:

- content consistency checks
- source-anchor checks against a local DeerFlow checkout
- Astro static build

For source-anchor checks outside the original DeerFlow workspace, point
`DEERFLOW_ROOT` at a local clone of `bytedance/deer-flow`:

```bash
DEERFLOW_ROOT=/path/to/deer-flow pnpm check
```

## Structure

```text
site/    Astro + MDX blog
notes/   source-reading notes and design observations used as source material
```

## License

This repository contains learning notes and blog source. Source references point
to the upstream DeerFlow project at pinned commits.
