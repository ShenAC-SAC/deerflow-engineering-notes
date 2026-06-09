# DeerFlow 可视化源码教程博客 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Astro+MDX static engineering blog whose index is a "请求的旅程" journey spine and whose stations are "心智模型卡", then convert the 02 lead-agent tutorial end-to-end as a bilingual (zh/en) vertical slice.

**Architecture:** Astro content collection (`tutorials`) holds bilingual MDX with structured frontmatter (station/mentalModel/risk/altitude/sourceRefs/sha/status). Custom Astro components render the journey index and the per-station deep-dive. Engineering design philosophy is a first-class visual element (`<Philosophy>`). Mermaid renders client-side. Verification = zod schema + `check-source-refs.mjs` anchor script + `astro build` green.

**Tech Stack:** Astro 5, @astrojs/mdx, zod (bundled), client-side Mermaid, plain CSS theme. Node 24 / pnpm 10. Lives at `tutorials/site/`, version-controlled in a tutorials-local git repo (separate from deer-flow upstream).

**Conventions:**
- Pin SHA for `sourceRefs` = current deer-flow HEAD (`0fb18e36`), anchor on invariants.
- Commits go to the `tutorials/` local repo only. NEVER to deer-flow. No `Co-Authored-By: Claude` trailer.
- Bilingual: both locales equal, lightly witty (风趣一点点), text-only.

---

## File Structure

```
tutorials/                          # git init here (standalone repo)
  .gitignore                        # node_modules, dist, .astro
  site/
    package.json
    astro.config.mjs                # i18n locales [zh,en], defaultLocale zh
    tsconfig.json
    scripts/check-source-refs.mjs   # anchor: sourceRefs exist at pinned sha
    src/
      content/
        config.ts                   # tutorials collection + zod schema
        tutorials/
          zh/01..08 stubs + 02 full
          en/01..08 stubs + 02 full
      components/
        RiskMeter.astro
        StationCard.astro
        JourneyIndex.astro
        MentalModel.astro
        MarginNote.astro
        Philosophy.astro
        Tradeoff.astro
        SourceRef.astro
        FlowDiagram.astro
        LangSwitch.astro
      layouts/
        BaseLayout.astro
        TutorialLayout.astro
      pages/
        index.astro                 # → /zh
        [lang]/index.astro          # JourneyIndex
        [lang]/journey/[station].astro
      styles/theme.css
```

---

### Task 0: Repo + scaffold

**Files:** Create `tutorials/.gitignore`, `tutorials/site/*` (via create-astro).

- [ ] **Step 1:** `cd tutorials && git init` (if not already a repo).
- [ ] **Step 2:** Scaffold minimal Astro into `site/`:
  `cd tutorials && pnpm create astro@latest site --template minimal --no-install --no-git --skip-houston --typescript strict`
- [ ] **Step 3:** Add deps: `cd tutorials/site && pnpm add @astrojs/mdx mermaid && pnpm install`
- [ ] **Step 4:** Write `tutorials/.gitignore`:
  ```
  node_modules/
  dist/
  .astro/
  .DS_Store
  ```
- [ ] **Step 5:** `cd tutorials/site && pnpm astro build` → expect SUCCESS (empty site builds).
- [ ] **Step 6:** Commit in tutorials repo: `git add -A && git commit -m "chore: scaffold astro site"`

### Task 1: i18n config + theme + BaseLayout

**Files:** `site/astro.config.mjs`, `site/src/styles/theme.css`, `site/src/layouts/BaseLayout.astro`

- [ ] **Step 1:** `astro.config.mjs` — enable mdx + i18n:
  ```js
  import { defineConfig } from 'astro/config';
  import mdx from '@astrojs/mdx';
  export default defineConfig({
    integrations: [mdx()],
    i18n: { locales: ['zh', 'en'], defaultLocale: 'zh',
            routing: { prefixDefaultLocale: true } },
  });
  ```
- [ ] **Step 2:** `theme.css` — dark engineering-console identity: bg `#0d1b2a`, accent `#48cae4`, card surface `#fff`/neo-brutalist 3px shadow, mono for code/labels, sans for prose. (CSS vars `--bg --accent --ink --card-shadow`.)
- [ ] **Step 3:** `BaseLayout.astro` — `<html lang>`, imports theme.css, slot, header with site title + `<LangSwitch>` placeholder.
- [ ] **Step 4:** `pnpm astro build` green. Commit.

### Task 2: Content collection + zod schema (the teeth)

**Files:** `site/src/content/config.ts`

- [ ] **Step 1:** Define collection with the spec schema:
  ```ts
  import { defineCollection, z } from 'astro:content';
  const tutorials = defineCollection({
    type: 'content',
    schema: z.object({
      lang: z.enum(['zh', 'en']),
      slug: z.string(),
      station: z.number().int().positive(),
      title: z.string(),
      mentalModel: z.string(),
      risk: z.number().int().min(1).max(5),
      altitude: z.enum(['实现', '架构', '哲学']),
      sourceRefs: z.array(z.string()).min(1),
      sha: z.string(),
      status: z.enum(['published', 'locked']),
    }),
  });
  export const collections = { tutorials };
  ```
- [ ] **Step 2 (teeth test):** Temporarily add a bad entry (`risk: 9`) in a scratch mdx, run `pnpm astro build`, expect FAIL citing risk ≤ 5. Remove scratch. Confirms schema rejects bad data.
- [ ] **Step 3:** Commit.

### Task 3: RiskMeter (smallest unit first)

**Files:** `site/src/components/RiskMeter.astro`

- [ ] **Step 1:** Implement: prop `value:1..5` → render `●`×value + `○`×(5-value), aria-label `风险 N/5`.
- [ ] **Step 2 (teeth):** Add a temporary test page `pages/_probe.astro` using `<RiskMeter value={3}/>`, build, grep dist HTML for `●●●○○`. Expect present. Remove probe page after.
- [ ] **Step 3:** Commit.

### Task 4: StationCard

**Files:** `site/src/components/StationCard.astro`

- [ ] **Step 1:** Props: `station,title,mentalModel,risk,altitude,status,href`. Renders neo-brutalist card: station badge, title, mentalModel line, `<RiskMeter>`, altitude tag. If `status==='locked'`: muted, dashed border, "🔒 待解锁", non-clickable.
- [ ] **Step 2:** Build green. Commit.

### Task 5: JourneyIndex + landing page

**Files:** `site/src/components/JourneyIndex.astro`, `site/src/pages/[lang]/index.astro`, `site/src/pages/index.astro`

- [ ] **Step 1:** `JourneyIndex.astro` — prop `lang`; `getCollection('tutorials')` filtered by lang, sorted by station; render vertical spine (numbered nodes + dashed connectors) where each node is a `<StationCard>` linking to `/[lang]/journey/[station]` when published.
- [ ] **Step 2:** `[lang]/index.astro` — `getStaticPaths` over [zh,en]; wraps `<JourneyIndex lang>` in BaseLayout.
- [ ] **Step 3:** `pages/index.astro` — redirect to `/zh`.
- [ ] **Step 4:** Build green. Commit.

### Task 6: Content components (philosophy first-class)

**Files:** `MentalModel.astro`, `MarginNote.astro`, `Philosophy.astro`, `Tradeoff.astro`, `SourceRef.astro`, `FlowDiagram.astro`, `LangSwitch.astro`

- [ ] **Step 1:** `MentalModel` — big opening callout (一句话心智模型).
- [ ] **Step 2:** `MarginNote` — aside in the right margin (desktop) / inline (mobile); lightly witty text.
- [ ] **Step 3:** `Philosophy` — distinct "🧭 工程设计哲学" callout block (accent left-border).
- [ ] **Step 4:** `Tradeoff` — two-column 取舍 (pros/cons or 这样/那样).
- [ ] **Step 5:** `SourceRef` — props `file, sha, symbol?`; renders mono pill linking to `https://github.com/bytedance/deer-flow/blob/<sha>/<file>`.
- [ ] **Step 6:** `FlowDiagram` — `<pre class="mermaid">` + once-per-page mermaid init script (client-side, dark theme).
- [ ] **Step 7:** `LangSwitch` — toggles `/zh/…` ↔ `/en/…` preserving station; wire into BaseLayout.
- [ ] **Step 8:** Build green. Commit.

### Task 7: TutorialLayout + station page

**Files:** `site/src/layouts/TutorialLayout.astro`, `site/src/pages/[lang]/journey/[station].astro`

- [ ] **Step 1:** `[station].astro` — `getStaticPaths`: for each published tutorial entry, emit `{lang, station}`; render its MDX `<Content/>` inside `TutorialLayout`, passing frontmatter.
- [ ] **Step 2:** `TutorialLayout` — header (station badge + title + `<RiskMeter>` + altitude + `sourceRefs` as `<SourceRef>`s), then `<MentalModel>` from frontmatter, then content slot, prev/next nav along the journey, components auto-available in MDX.
- [ ] **Step 3:** Build green. Commit.

### Task 8: Station stubs (all 8, both locales)

**Files:** `site/src/content/tutorials/{zh,en}/01..08-*.mdx`

- [ ] **Step 1:** For stations 1,3,4,5,6,7,8 create stub MDX (frontmatter `status: locked`, minimal body) in BOTH zh and en, using the journey table from the spec (titles + mentalModel for 1/3/4; 5-8 mentalModel = "待解锁"/"coming soon"). station 2 created full in Task 9.
- [ ] **Step 2:** Build green; visit `/zh` and `/en` show all 8 stations, only 02 clickable. Commit.

### Task 9: Convert 02 fully (the vertical slice)

**Files:** `site/src/content/tutorials/zh/02-lead-agent-factory.mdx`, `.../en/02-lead-agent-factory.mdx`

Source material: existing `deerflow-source-code-reading/02-lead-agent-factory.md` + philosophy from `deerflow-3.0-design-notes/01-tool-system.md`.

- [ ] **Step 1:** Frontmatter (both locales): `station:2, slug:'02-lead-agent-factory', risk:3, altitude:'架构', status:'published', sha:'0fb18e36', sourceRefs:['backend/packages/harness/deerflow/agents/lead_agent/agent.py','backend/langgraph.json']`.
- [ ] **Step 2:** Body (zh): rewrite into blog voice — `<MentalModel>` "装配线,不是大脑"; sections: 旅程定位 / 主流程 `<FlowDiagram>` / `make_lead_agent` vs `_make_lead_agent` 兼容边界 / 运行选项与模型解析 / 最终配方 / `<Philosophy>` (为什么是兼容适配器:多宿主 ABI 取舍) + `<Tradeoff>` (clean vs compat) / `<MarginNote>` 风趣旁白 / `<SourceRef>` pins. Lightly witty.
- [ ] **Step 3:** Body (en): faithful equal-tone translation, same components/structure.
- [ ] **Step 4:** Build green; `/zh/journey/2` and `/en/journey/2` render with all components + mermaid. Commit.

### Task 10: Anchor verification script

**Files:** `site/scripts/check-source-refs.mjs`, `site/package.json` (script entry)

- [ ] **Step 1:** Script: read all `src/content/tutorials/**/*.mdx` frontmatter; for each, `git -C <deer-flow root> cat-file -e <sha>:<ref-path>` for every `sourceRefs` path (strip `#symbol`); exit nonzero listing any missing. Deer-flow root resolved relative to script (`../../..`).
- [ ] **Step 2:** Add `"check:refs": "node scripts/check-source-refs.mjs"` to package.json.
- [ ] **Step 3:** Run `pnpm check:refs` → expect PASS (02's refs exist at 0fb18e36).
- [ ] **Step 4 (teeth):** Temporarily break a ref path, run, expect FAIL naming it. Restore. Commit.

### Task 11: Final verification + README

**Files:** `site/README.md`

- [ ] **Step 1:** `pnpm astro build` → SUCCESS.
- [ ] **Step 2:** `pnpm check:refs` → PASS.
- [ ] **Step 3:** `pnpm astro preview` (or dev) — manually confirm: `/zh` & `/en` journey render; 02 both locales render with cards, risk meter, philosophy callout, mermaid diagram, lang switch.
- [ ] **Step 4:** Write `site/README.md` (dev/build/check commands, structure, how to add a station).
- [ ] **Step 5:** Final commit in tutorials repo.

---

## Self-Review

- **Spec coverage:** §2 stack→T0/T1; §4 content model/i18n→T1/T2; §5 components→T3/T4/T6; §6 visual identity→T1; §7 layout→all; §8 journey stations→T8; §9 pilot DoD→T9/T11; §10 verification→T2(teeth)/T10/T11. Philosophy first-class (user emphasis)→`<Philosophy>` T6 + T9. ✓
- **Placeholders:** none — each task names exact files + concrete code/commands.
- **Type consistency:** schema fields in T2 match frontmatter authored in T8/T9 and props consumed in T4/T7. `RiskMeter value` consistent T3→T4→T7.
- **Note:** classic unit-TDD is adapted for a static content site — "teeth" steps (T2/T3/T10) assert real failures (schema reject, rendered glyphs, missing-ref) instead of mocks.
