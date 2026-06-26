# DeerFlow 3.0 Design Notes: Skills Policy And Storage

This note records design observations from reading the current DeerFlow skills system.

## Current Shape

A skill is a filesystem package:

```text
skills/public/<name>/SKILL.md
skills/custom/<name>/SKILL.md
skills/custom/.history/<name>.jsonl
```

The runtime uses skills in four different ways:

```text
discovery
  load enabled skills and list name / description / location in the lead prompt.

activation
  slash activation injects the full SKILL.md content for the current turn.

installation and editing
  archive install and skill_manage validate, scan, write, and record history.

tool policy
  allowed-tools can filter the actual tool list.
```

This is already a useful separation. The remaining debt is that policy, activation scope, and storage concurrency are still coarse.

## Design Observation 1: Tool Policy Should Be Scoped To Active Use

Current behavior:

```text
No loaded skill declares allowed-tools
  -> allow all legacy tools.

At least one loaded skill declares allowed-tools
  -> allow the union of all explicit declarations.
```

The union is simple and backwards-compatible, but it is broader than the actual task in one common case: the agent may have several enabled skills, while the user explicitly activated only one.

For 3.0, separate these concepts:

```text
installed skills
  what exists on disk.

enabled skills
  what an agent may use.

active skills for this turn
  what this request actually selected or loaded.

tool policy
  the tool set allowed by the active capability context.
```

Possible shape:

```ts
interface ActiveSkillContext {
  installed: string[];
  enabledForAgent: string[];
  activatedThisTurn: string[];
  loadedThisTurn: string[];
}

interface ToolPolicyDecision {
  visibleTools: string[];
  executableTools: string[];
  reason: string;
}
```

The key design point is not to make policy more complex for its own sake. It is to make the runtime answer a concrete question:

```text
Why is this tool available in this turn?
```

## Design Observation 2: Security Scanning Needs A Deterministic Layer

The current scanner is conservative: if the model scanner fails or returns invalid output, skill installation/writing is blocked. That fail-closed behavior is correct.

But an LLM scanner should not be the only review layer for skill packages. It is useful for semantic review, but weak at deterministic checks.

For 3.0, add a static scanner before the model scanner:

```text
static scanner
  script environment-variable access
  suspicious shell patterns
  network download-and-execute patterns
  sensitive system path access
  credential access hints

LLM scanner
  semantic prompt-injection and workflow review

approval policy
  whether warn/block requires user approval or hard rejection
```

This gives operators a stable reason when a package is rejected:

```text
blocked by static rule: scripts/install.sh reads $OPENAI_API_KEY
blocked by model scanner: attempts to override system instructions
```

## Design Observation 3: Skill Writes Need Storage-level Concurrency

`skill_manage_tool` uses an in-process `asyncio.Lock` per skill name. That protects concurrent writes inside one Python process, but not across multiple Gateway workers sharing the same skills root.

Archive install has a stronger final-directory reservation path:

```text
target.mkdir(mode=0o700)
move staging files
cleanup target on failed install
```

Custom skill edits do not have the same cross-process protection.

For 3.0, push concurrency into the storage layer:

```text
SkillStorage.begin_write(name)
  -> acquires file lock / DB row lock / object-store lease

SkillStorage.commit_write(...)
  -> versioned write or compare-and-swap

SkillStorage.append_history(...)
  -> same transaction or same lock boundary
```

The target property:

```text
Two writers editing the same custom skill cannot silently overwrite each other.
```

## Design Observation 4: public/custom Overlay Should Be Observable

Current loading deduplicates by skill name, so a custom skill can override a public skill with the same name. This is useful for customization, but it should be visible.

For 3.0, expose effective origin:

```text
skill name
effective category: custom
shadowed category: public
effective path
shadowed path
enabled state source
```

This helps answer:

```text
Why did the agent follow a different version of this skill?
```

## Design Observation 5: Skill Discovery Needs A Prompt Budget

Current runtime prompt injection lists enabled skills as discovery metadata:

```xml
<available_skills>
  <skill>
    <name>repo-auditor</name>
    <description>...</description>
    <location>/mnt/skills/public/repo-auditor/SKILL.md</location>
  </skill>
</available_skills>
```

This is not full `SKILL.md` injection. It is the skill catalog the model uses to decide which skill to load progressively. But the catalog still lives in the lead-agent prompt, so it has real token cost and attention cost.

If a user or organization installs many skills, always injecting every `name + description + location` creates three problems:

```text
token cost
  discovery metadata grows on every run.

attention noise
  unrelated skills compete with the current task.

hidden failure mode
  users may not know that adding skills increases prompt footprint.
```

For 3.0, give skill discovery a separate budget:

```yaml
skills:
  prompt_budget_tokens: 1200
  overflow_strategy: priority_descriptions
  warn_when_truncated: true
```

The runtime can then apply a deterministic degradation policy:

```text
always keep description
  explicitly activated skills
  skills pinned by the agent config
  recently used or frequently matched skills

degrade first
  rarely used skills
  low-priority skills
  skills outside the current agent's likely domain

degraded representation
  name + location
  or name + very short summary
```

The important point is to avoid a self-reinforcing trap: if rarely used skills lose their description forever, the model becomes less likely to discover them, which makes them look even less useful. Degradation should therefore be observable and reversible. The prompt or runtime metadata should state that some descriptions were omitted by budget, and the user should know which config value to raise if they want more complete discovery metadata.

This design answers a different question from tool policy:

```text
tool policy
  Which tools may execute?

skill discovery budget
  Which skill descriptions are worth spending prompt tokens on before the model chooses what to load?
```

## Proposed 3.0 Shape

Keep the filesystem package model, but make the runtime contracts explicit:

```text
SkillPackage
  parsed files and metadata.

SkillRegistry
  installed/enabled/effective origin.

SkillActivation
  active skill context for this turn.

SkillDiscoveryBudget
  prompt budget, priority, and degradation rules for available-skill metadata.

SkillToolPolicy
  visible/executable tools derived from active context.

SkillStorageTransaction
  concurrency and history boundary for writes.

SkillSecurityReview
  deterministic scanner + model scanner + approval result.
```

The goal is not more abstraction. The goal is to make three things inspectable:

```text
Which skill was used?
Why was a tool available?
Who changed this skill, and what review allowed it?
```
