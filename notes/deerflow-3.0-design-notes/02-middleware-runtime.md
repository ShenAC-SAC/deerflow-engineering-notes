# DeerFlow 3.0 Design Notes: Middleware And Runtime Policy

This note records design observations from reading the DeerFlow 2.x middleware pipeline.

## Current 2.x Shape

In 2.x, middleware is the main extension layer around the LangGraph agent loop:

```text
model call
tool call
after agent
```

Middleware handles many categories of behavior:

- message patching
- dynamic context injection
- file upload exposure
- sandbox preparation
- title generation
- memory enqueue
- tool error normalization
- deferred tool enforcement
- clarification interruption
- safety/guardrail handling

This works because LangGraph middleware gives DeerFlow a practical place to attach runtime behavior without rewriting the agent loop.

## Key 2.x Lessons

### Middleware Is Doing More Than One Kind Of Work

In practice, 2.x middleware contains at least four categories:

```text
state preparers
  -> ThreadDataMiddleware
  -> SandboxMiddleware
  -> UploadsMiddleware

message transformers
  -> DynamicContextMiddleware
  -> DanglingToolCallMiddleware
  -> ViewImageMiddleware

policy enforcers
  -> DeferredToolFilterMiddleware
  -> SubagentLimitMiddleware
  -> GuardrailMiddleware
  -> ToolErrorHandlingMiddleware

side-effect workers
  -> TitleMiddleware
  -> MemoryMiddleware
  -> SummarizationMiddleware
```

The category is not explicit in code. A new contributor has to infer it from hooks and state writes.

For 3.0, make the category explicit in middleware registration or runtime metadata.

Example:

```ts
type RuntimeExtensionKind =
  | "state-preparer"
  | "message-transformer"
  | "policy-enforcer"
  | "side-effect"
  | "control-flow";
```

### Ordering Should Be Declarative

2.x relies on list order:

```python
middlewares = [...]
```

That is simple, but fragile. Some order constraints are semantic:

```text
uploads before model call
thread data before upload path resolution
sandbox before sandbox tool execution
deferred tool filter before model sees tool schemas
clarification near the final boundary
memory after final assistant response
```

For 3.0, middleware registration should express dependencies:

```ts
registerMiddleware({
  name: "uploads",
  phase: "before-model",
  after: ["thread-data"],
  writes: ["uploadedFiles", "messages"],
});
```

Then runtime can validate:

```text
missing dependency
cycle
two middleware writing same field without reducer
side-effect middleware placed before required state exists
```

### State Writes Should Be Visible

In 2.x, a middleware may:

- patch request messages only
- return a state update
- return a `Command`
- mutate an object
- trigger a background side effect

These are all valid, but they look similar at call sites.

For 3.0, runtime extensions should declare their state contract:

```ts
interface RuntimeExtensionManifest {
  reads: StateKey[];
  writes: StateKey[];
  sideEffects: SideEffectKind[];
  externalResources?: ResourceKind[];
}
```

This helps answer:

```text
Why did messages change?
Who wrote artifacts?
Which middleware depends on sandbox?
Which extension can call a model?
```

### Reducers Are A Good Idea, But Need Better Surfacing

LangGraph reducers solve the real problem of concurrent or repeated updates to one state field.

The design lesson is strong:

```text
state field owns its merge semantics
writers only submit updates
```

For 3.0, keep this idea, but make it more discoverable.

Example:

```ts
const ThreadState = defineState({
  artifacts: list<string>().reduce(mergeArtifacts),
  viewedImages: map<ViewedImage>().reduce(mergeViewedImages),
  promoted: promotedTools().reduce(mergePromotedTools),
});
```

The developer should be able to inspect one state schema and understand update behavior.

### Model-Visible Messages Need Structured Provenance

2.x often injects hidden `HumanMessage` objects as runtime context:

```text
DynamicContextMiddleware -> date and memory reminders
TodoMiddleware           -> todo_reminder / todo_completion_reminder
ViewImageMiddleware      -> image details and base64 image blocks
SkillActivationMiddleware -> full SKILL.md content
```

This is pragmatic because providers generally accept human messages more reliably than mid-conversation system messages. But the provenance of these messages is not always structured.

For example, `ViewImageMiddleware` prevents duplicate image injection by scanning message text:

```text
"Here are the images you've viewed"
```

That works, but it couples correctness to user-facing prompt wording. If the wording changes, duplicate-injection detection can silently break and repeatedly add large base64 image blocks to context.

For 3.0, runtime-injected messages should carry explicit metadata:

```ts
{
  role: "user",
  content: [...],
  visibility: "model-only",
  source: {
    kind: "middleware",
    name: "view-image",
    purpose: "project-viewed-images",
    idempotencyKey: "view-image:<ai-message-id>:<tool-call-ids-hash>"
  }
}
```

Then middleware can ask structured questions:

```text
Has this image projection already been injected for this tool turn?
Should this message be hidden from UI?
Should memory/title/summarization ignore it?
Is it durable state or request-only context?
```

The core lesson:

```text
Do not use prompt text as runtime control metadata.
```

Another boundary lesson from `ViewImageMiddleware`:

```text
Do not use "last HumanMessage" as a proxy for "last user input".
```

In 2.x, runtime-injected context is often represented as hidden `HumanMessage` for provider compatibility. That means a message list may contain several human-role messages that are not authored by the user:

```text
HumanMessage(user request)
HumanMessage(dynamic context reminder)
HumanMessage(todo reminder)
HumanMessage(view-image details)
HumanMessage(skill activation)
```

For turn-local logic, anchor on the event that actually defines the turn. For example, image projection should be scoped to the last `AIMessage` that emitted a `view_image` tool call, not to the last `HumanMessage`.

For 3.0, the runtime message envelope should separate provider role from DeerFlow author/source:

```ts
{
  providerRole: "user",
  author: "runtime",
  visibility: "model-only",
  source: {
    kind: "middleware",
    name: "view-image"
  }
}
```

Then code can ask:

```text
last user-authored message?
last runtime-injected context?
last assistant tool-call turn?
last model-visible message?
```

without guessing from provider role alone.

### Provider-Compatible Is Not Provider-Neutral

2.x uses LangChain message objects and common multimodal content blocks such as:

```ts
[
  { type: "text", text: "..." },
  { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
]
```

This is "provider-compatible" in the practical sense that it maps well to common model APIs through LangChain adapters. It is not a universal standard across all vendors.

Provider differences can appear in:

```text
content block field names
image URL vs inline base64 support
data URL support
maximum image size
allowed mime types
system/user/tool role ordering
tool-call pairing validation
streaming behavior for multimodal inputs
```

For 3.0, DeerFlow should avoid treating provider-shaped messages as the internal canonical representation.

A cleaner split:

```ts
type DeerFlowContentBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; bytesRef: string; mimeType: string; sourcePath?: string };

interface ProviderAdapter {
  toProviderMessages(messages: DeerFlowMessage[]): ProviderMessage[];
}
```

Then middleware can produce DeerFlow-native runtime messages:

```text
ViewImageMiddleware -> DeerFlow image block
ProviderAdapter     -> OpenAI/Anthropic/Gemini-specific message shape
```

This keeps model/provider quirks at the adapter boundary instead of leaking them into every middleware.

### Tool Policy Needs Presentation And Execution Enforcement

`DeferredToolFilterMiddleware` shows an important runtime policy principle:

```text
Hiding a tool schema from the model is necessary but not sufficient.
```

The model may still attempt to call a hidden tool because of:

```text
stale conversation history
prompt hints that list deferred tool names
provider quirks
checkpoint restore edge cases
bugs in schema filtering
model guessing
```

So tool policy needs two enforcement points:

```text
presentation enforcement
  -> which tool schemas are bound into the model request?

execution enforcement
  -> which tool calls are allowed to actually run?
```

For 3.0, this suggests a first-class policy result:

```ts
interface ToolVisibilityPolicy {
  visibleSchemas: ToolName[];
  executableTools: ToolName[];
  blockedTools: Array<{ name: ToolName; reason: string }>;
}
```

And a runtime rule:

```text
Every denied tool call should still close the tool-call protocol with a structured ToolMessage-equivalent result.
```

That lets the model recover while keeping the graph state valid.

### Subagent Concurrency Should Be A Capability Policy

2.x protects the system from subagent fan-out with `SubagentLimitMiddleware`, which truncates extra `task` tool calls after the model emits them and before tools execute.

This is the right enforcement point: prompt guidance alone is not enough for resource limits.

However, the current policy clamps the configured maximum into `[2, 4]`:

```text
min max_concurrent_subagents = 2
max max_concurrent_subagents = 4
```

This should be read together with the project-level `subagent_enabled` switch:

```text
subagent_enabled=False
  -> do not expose task_tool
  -> do not install SubagentLimitMiddleware
  -> subagents are disabled

subagent_enabled=True
  -> expose task_tool
  -> install SubagentLimitMiddleware
  -> clamp max_concurrent_subagents into [2, 4]
```

So the 2.x issue is not "subagents cannot be disabled"; they can. The narrower issue is that the enabled state cannot express "allow subagents, but only one at a time."

This is a configuration-semantics limitation, not an execution limitation:

```text
If the model emits one task call, 2.x allows it.
If the operator configures max_concurrent_subagents=1, 2.x clamps it to 2.
```

For 3.0, subagent access should be represented as one explicit capability policy instead of splitting the semantics across `subagent_enabled`, `task_tool` injection, and `SubagentLimitMiddleware`:

```ts
interface SubagentPolicy {
  enabled: boolean;
  maxConcurrent: number;      // allow 1 or N when enabled; disabled is explicit
  maxDepth: number;
  allowedSubagents: string[];
  overflowBehavior: "truncate" | "reject-with-tool-error" | "ask-model-to-replan";
}
```

The policy should distinguish:

```text
whether subagents are available
how many can run concurrently
what happens when the model asks for too many
```

This is clearer than making `task_tool` presence and `max_concurrent_subagents` jointly imply the subagent capability.

A deeper policy is possible, but it should be separated from concurrency limiting:

```text
SubagentLimitMiddleware
  -> cheap structural enforcement: too many task calls

DelegationQualityPolicy
  -> semantic review: are task descriptions independent, bounded, and worth delegating?
```

Semantic review could check:

```text
duplicate task descriptions
tasks that overlap too much
tasks that require shared write ownership
tasks that are too vague to execute
tasks that should be done locally instead of delegated
```

But that probably needs either heuristic scoring or another model call, so it belongs in a first-class delegation policy layer rather than a tiny after-model truncation middleware.

One possible 3.0 design is an optional delegation judge:

```text
Lead model emits task tool calls
  -> DelegationJudge reviews the proposed split
  -> approve / trim / ask model to replan / convert to local execution
  -> only approved task calls reach the subagent executor
```

This could catch:

```text
overlapping subtasks
vague prompts
missing expected outputs
shared write ownership conflicts
unnecessary delegation for simple tasks
too many dependent tasks launched in parallel
```

Tradeoff:

```text
quality improves
but latency and cost increase because another model call may sit in the critical path
```

So this should be configurable:

```ts
interface DelegationJudgePolicy {
  enabled: boolean;
  mode: "off" | "heuristic" | "model-judge";
  runOn: "always" | "multi-task-only" | "high-risk-only";
  failureBehavior: "allow" | "reject" | "ask-replan";
}
```

The default path can remain cheap deterministic enforcement, while enterprise or high-risk deployments can enable semantic review.

### Tool-Call Loop Control Needs Soft And Hard Brakes

`LoopDetectionMiddleware` shows a useful safety pattern:

```text
soft brake
  -> warn the model and ask it to stop repeating

hard brake
  -> structurally prevent further tool execution
```

Soft warnings cannot always be inserted immediately. If the current assistant message contains tool calls, inserting a runtime message before corresponding tool results would break provider tool-call pairing.

So 2.x queues warnings and injects them only at the next model request.

For 3.0, make this explicit in the runtime contract:

```ts
type RuntimeIntervention =
  | { kind: "requestOnlyReminder"; injectAt: "next-model-call"; message: ModelOnlyMessage }
  | { kind: "rewriteAssistantMessage"; clearToolCalls: true; reason: string };
```

Loop detection should also produce structured telemetry:

```ts
interface LoopDetectionEvent {
  detectionKind: "same-call-hash" | "tool-frequency";
  toolNames: string[];
  count: number;
  threshold: number;
  action: "warn" | "hard-stop";
}
```

This would let UI and logs distinguish:

```text
model was warned
tool calls were forcibly stripped
which tool caused the loop
which threshold fired
```

without parsing natural-language warning text.

### Policy Should Preserve Agent Autonomy Where It Matters

Reading `ask_clarification` surfaces a broader design tradeoff:

```text
stronger control
  -> lower variance, safer behavior, more predictable product experience

weaker control
  -> more model autonomy, higher ceiling, more creative task handling
```

The goal should not be to make the agent maximally constrained. The goal is to separate hard boundaries from soft guidance and leave an autonomy space inside the boundary.

Useful split:

```text
Hard constraints
  things the agent must not violate
  examples: destructive action confirmation, permission boundaries, tool policy,
  cost limits, concurrency limits, missing required input

Soft guidance
  strong recommendations that improve behavior but should not overfit every case
  examples: ask one clarification at a time, provide options for approach choices,
  decompose complex work before delegation

Autonomy space
  choices the agent should make itself
  examples: question wording, context explanation, exploration path,
  synthesis strategy, option generation
```

For 3.0, clarification should probably be represented as policy plus runtime behavior:

```ts
interface ClarificationPolicy {
  hardRules: {
    destructiveActionRequiresConfirmation: boolean;
    missingRequiredInputBlocksExecution: boolean;
  };
  softGuidance: {
    askOneQuestionAtATime: boolean;
    preferOptionsForApproachChoice: boolean;
  };
  interruptBehavior: "end-run" | "pause-run";
}
```

The design principle:

```text
Keep the agent free inside the boundary.
Make the boundary explicit and enforceable by runtime.
```

### Clarification Exclusivity Is A Runtime Policy

The 2.x implementation exposes clarification as a tool:

```text
ask_clarification
  -> tool schema for the model
  -> ClarificationMiddleware for runtime behavior
  -> ToolMessage for UI/channel rendering
```

This is a good product shape, but one subtle boundary matters:

```text
The prompt asks the model to call ask_clarification first and by itself.
The runtime path does not fully enforce that at the AIMessage.tool_calls level.
```

The normal path works:

```text
AIMessage(tool_calls=[ask_clarification])
  -> middleware returns Command(update={messages: [...]}, goto=END)
  -> all client-side tools are return_direct
  -> create_agent routes to END
```

But the mixed path is different:

```text
AIMessage(tool_calls=[normal_tool, ask_clarification])
  -> ToolNode may execute both tool calls from the same assistant message
  -> clarification returns Command(goto=END)
  -> normal_tool returns ToolMessage
  -> not all client-side tools are return_direct
  -> graph may route back to model
```

This means clarification has three separate concerns:

```text
model affordance
  the model needs a schema it can choose

interrupt representation
  the UI/channel needs a structured event to show the user

execution policy
  the runtime must decide whether clarification is exclusive and what to do with siblings
```

For 3.0, those should not be collapsed into one `BaseTool` flag.

One possible policy shape:

```ts
interface ToolCallArbitrationPolicy {
  exclusiveTools: {
    ask_clarification: {
      whenMixed: "drop-siblings" | "block-siblings" | "treat-as-error";
      interrupt: "end-run" | "pause-run";
      reason: "requires-user-input";
    };
  };
}
```

The enforcement point should be before ordinary tool side effects start:

```text
after_model / pre_tools arbitration
  -> inspect the whole AIMessage.tool_calls list
  -> if ask_clarification is present with siblings:
       either keep only ask_clarification,
       or replace sibling calls with structured policy-denial ToolMessages,
       or ask the model to regenerate a valid action
  -> then enter ToolNode
```

This is the difference between a soft instruction and a hard runtime guarantee:

```text
Prompt says: ask first.
Runtime guarantees: no ordinary tool side effects happen before the answer.
```

The policy should still preserve autonomy inside the boundary. The model can choose the
question wording, context, options, and whether clarification is needed. The runtime only
enforces the safety contract once that tool is chosen.

Design rule:

```text
If a tool represents a run-level interrupt, do not rely on tool-local return_direct
semantics to enforce whole-turn exclusivity.
```

### Tool Result Normalization Belongs At The Execution Boundary

`ToolErrorHandlingMiddleware` shows a useful 3.0 boundary:

```text
tools should implement domain behavior
the runtime should normalize execution results
```

Without a shared boundary, every tool would need to remember the same protocol work:

```text
catch exceptions
format error text
preserve tool_call_id
set ToolMessage(status="error")
avoid swallowing graph interrupts
stamp frontend metadata
```

That duplicates logic and invites drift. One tool might return an error message without
`status="error"`. Another might raise and leave a dangling tool call. Another might
accidentally catch a graph interrupt and break resume behavior.

For 3.0, tool result normalization should be explicit:

```ts
type ToolExecutionResult =
  | { kind: "success"; message: ToolMessage }
  | { kind: "tool_error"; message: ToolMessage; errorType: string }
  | { kind: "policy_denial"; message: ToolMessage; policy: string }
  | { kind: "control_flow"; command: RuntimeCommand };
```

The important split:

```text
Expected domain failure
  -> tool may return a clear, domain-specific error result

Uncaught execution failure
  -> runtime boundary converts it to a protocol-valid tool error

Runtime control flow
  -> never masquerades as a tool failure
```

For subagents, the same boundary can enrich results with structured UI contract fields:

```text
task tool result
  -> subagent_status metadata
  -> frontend card state
```

Design rule:

```text
Do not make frontend state depend on natural-language tool result prefixes.
Do not make every tool reimplement provider protocol hygiene.
```

### Sandboxes Need Shared Structured Findings

Reading `SandboxMiddleware`, `task_tool`, and `MemoryMiddleware` surfaces an important
3.0 boundary:

```text
sandbox sharing
  is not the same as
memory sharing
```

In the 2.x runtime, a subagent launched through `task` receives parent context such as:

```text
sandbox_state
thread_data
thread_id
```

So subagents are not completely cold-started at the execution layer. They can inherit the
same thread file context and sandbox identity. But this is not yet a shared semantic
memory layer:

```text
Subagent A discovers a repo invariant.
Subagent B does not automatically see that discovery in real time.
```

The current memory middleware is closer to post-run conversation memory:

```text
user inputs + final assistant responses
  -> async memory queue
  -> later durable memory update
```

That is useful, but it is different from the "shared lab notebook" needed by parallel
subagents working in separate contexts.

For 3.0, the useful missing layer is:

```text
run/thread-scoped shared structured findings
```

This should not be raw chat transcript sharing. The important object is an
evidence-backed finding:

```ts
interface SharedFinding {
  scope: "run" | "thread" | "sandbox" | "user";
  kind:
    | "environment_fact"
    | "repo_pattern"
    | "failed_attempt"
    | "solution_shape"
    | "cross_domain_analogy";
  claim: string;
  evidence: string[];
  appliesTo: string[];
  confidence: number;
  producedBy: string;
  createdAt: string;
  invalidatesWhen?: string[];
}
```

A parallel subagent workflow would then look like:

```text
Subagent A explores
  -> writes finding: "tutorial site uses pnpm, not npm"

Subagent B starts or hits a related problem
  -> queries thread/run findings
  -> avoids rediscovering the same fact
```

This is where sandbox and memory become complementary:

```text
Sandbox
  -> gives each agent an isolated computer

Shared structured findings
  -> let isolated agents reuse discoveries without sharing full raw context
```

The first version should stay modest:

```text
1. Sandbox artifact sharing
   files, logs, experiment outputs, caches

2. Run-local shared findings
   live discoveries reusable by sibling subagents in the same run

3. Durable structural memory
   longer-lived patterns and solution shapes across threads/domains
```

The durable third layer is the ambitious one. It is where cross-domain transfer becomes
interesting:

```text
diffusion in physics
Black-Scholes in finance
image denoising in ML
```

The reusable object is not the surface vocabulary. It is the structure:

```text
entities
relationships
constraints
solution shape
evidence
```

Design risk:

```text
Wrong findings can spread faster than right findings.
Old findings can outlive their validity.
Local discoveries can be over-applied outside their scope.
```

So every shared finding needs explicit scope and evidence. Avoid a vague global memory
blob.

Design rule:

```text
Sandbox gives agents isolated execution.
Shared structured findings let isolated agents avoid rediscovering the same facts.
Store evidence-backed structure, not raw context.
```

### Sandbox Lifecycle Semantics Should Be Explicit

`SandboxMiddleware` also exposes a naming problem:

```text
release
```

can mean several different things depending on the provider:

```text
destroy the sandbox
return it to a pool
close a client handle
mark this run as done
do nothing because reuse is intentional
```

For example, `LocalSandboxProvider` is a local-filesystem sandbox provider, not a local
model provider. "Local" describes where tool execution and path mapping happen. It keeps
small per-thread `LocalSandbox` objects in memory and returns ids like:

```text
local:<thread_id>
```

That reuse is cheap and useful because a `LocalSandbox` mainly holds path mappings and
bookkeeping such as agent-written paths. It is not a heavy VM or remote container that
must be destroyed after each run.

This means the middleware-level statement:

```text
after_agent -> provider.release(sandbox_id)
```

does not fully describe lifecycle semantics. The provider decides whether `release`
destroys anything.

For 3.0, separate these concepts:

```ts
interface SandboxLifecycle {
  acquire(scope: SandboxScope): SandboxHandle;
  markRunDone(handle: SandboxHandle, runId: string): void;
  releaseHandle(handle: SandboxHandle): void;
  destroy(handle: SandboxHandle): void;
  shutdown(): void;
}

interface SandboxScope {
  userId: string;
  threadId: string;
  runId?: string;
  agentId?: string;
}
```

The multi-user boundary should also be explicit. `ThreadDataMiddleware` computes
thread paths using both:

```text
thread_id
user_id
```

while a local sandbox cache may be keyed by `thread_id`. That is safe only if
`thread_id` is globally unique across users. If `thread_id` is merely user-local, a
provider keyed only by `thread_id` risks reusing path mappings across users.

3.0 should not leave this to convention:

```text
sandbox cache key = provider-defined SandboxScope, not an informal string id
```

Design rule:

```text
Make sandbox ownership and lifecycle verbs precise.
Do not overload "release" to mean both "run is done" and "destroy resources".
Do not rely on thread_id uniqueness unless it is part of the runtime contract.
```

### Sandbox Isolation Level Must Be Part Of The Contract

The word "sandbox" can create false confidence. In 2.x, the same `Sandbox` interface can
be backed by very different implementations:

```text
LocalSandboxProvider
  -> local filesystem path mapping
  -> optional host shell execution
  -> not a strong isolation boundary

container-based provider
  -> commands run in a container/pod/external sandbox service
  -> stronger isolation, depending on mounts and runtime configuration
```

Virtual paths such as:

```text
/mnt/user-data/workspace
/mnt/user-data/uploads
/mnt/user-data/outputs
```

are valuable, but they should not be described as the security boundary. They provide:

```text
stable model-facing paths
local/container portability
host path hygiene
output masking
thread-scoped API surface
```

They do not by themselves prevent dangerous execution. In local mode, host bash means
host shell execution permission. It is not a network toggle. Network access is only one
possible consequence of having shell execution in an environment that can reach the
network.

For 3.0, each sandbox provider should declare its security properties:

```ts
interface SandboxProviderManifest {
  name: string;
  executionBackend: "local-process" | "docker-container" | "kubernetes-pod" | "external-service";
  isolationLevel: "none" | "path-validated-local" | "container" | "vm" | "external";
  supportsHostBash: boolean;
  defaultHostBashAllowed: boolean;
  pathVirtualization: boolean;
  mountPolicy: "thread-user-data-only" | "configured-mounts" | "provider-defined";
  multiUserSafeByDefault: boolean;
}
```

Runtime and UI can then make risk legible:

```text
Local provider + host bash disabled
  -> file tools are path-validated, bash unavailable

Local provider + host bash enabled
  -> trusted local workflow only

Container provider
  -> inspect mounts, image, network, socket access, and provisioner trust
```

Design rule:

```text
Do not let a stable virtual path or a "sandbox" label imply isolation.
Expose the provider's actual isolation level and dangerous capabilities.
```

## Proposed 3.0 Split

### Agent Graph

Owns the reasoning loop:

```text
model -> tools -> model -> ...
```

It should not directly own upload parsing, memory flushing, title generation, or sandbox provisioning.

### Runtime Extensions

Own cross-cutting behavior around the graph:

```text
context injection
state preparation
policy enforcement
side effects
interrupt/resume behavior
```

But extensions should declare:

```text
phase
order constraints
state reads/writes
side effects
failure behavior
```

### Runtime Kernel

Owns execution guarantees:

```text
ordering
cancellation
timeouts
stream events
state commit
checkpoint boundary
side-effect scheduling
error normalization
```

The kernel should make these questions explicit:

```text
If middleware writes state and then side effect fails, what commits?
If run is cancelled, which side effects are cancelled?
If memory update is debounced, is it part of run completion or background work?
If a tool requests clarification, is that a tool result, an interrupt, or a run status?
```

## Design Direction

For 3.0, avoid making middleware a generic "anything can happen here" list.

A better split:

```text
State schema
  -> durable fields and reducers

Runtime extension manifest
  -> phase, reads, writes, side effects, ordering

Runtime kernel
  -> executes graph and extensions with clear guarantees

Policy layer
  -> tool exposure, sandbox permission, subagent limits, user/workspace rules
```

The goal is not to remove middleware. The goal is to make each middleware's contract legible.

## Context-Aware Summarization

Current DeerFlow summarization already contains an important design signal:

```text
not all old messages are equally compressible
```

The skill-read rescue logic is a hard-coded version of a broader policy:

```text
ordinary old discussion:
  can become summary text

active execution context:
  may need to remain as raw messages
```

For 3.0, summarization should move toward structured context items:

```text
message history
  -> extract context items
  -> classify type
  -> attach provenance
  -> score retention value
  -> decide keep raw / summarize / store memory / drop
```

Example context item types:

```text
user_preference
hard_constraint
active_task
skill_instruction
file_schema
environment_fact
tool_result
decision
correction
unresolved_question
```

High-value context is not simply "important sounding" text. It is context whose
loss would harm later execution:

```text
affects future behavior
hard to reconstruct from summary
has protocol pairing requirements
is still connected to the active task
cannot be cheaply reloaded
contains exact constraints, schemas, paths, or instructions
```

Current-task relevance can be estimated from:

```text
active plan/todo state
currently activated skill
recently referenced files or schemas
open unresolved questions
dependency links between the current task and earlier tool results
```

This would generalize the current skill rescue:

```text
from:
  if tool call reads /mnt/skills, rescue recent paired messages

to:
  if a context item remains executable and task-relevant, keep or refresh it
  under an explicit budget
```

The important 3.0 distinction:

```text
summary text preserves narrative continuity
raw retained context preserves execution correctness
```

## Useful Rule For Review

When reviewing a new middleware in 3.0, ask:

```text
What phase does it run in?
What state does it read?
What state does it write?
What external side effects can it trigger?
What must run before it?
What must run after it?
What happens if it fails?
Is it part of the run result or background work?
```

If those questions are hard to answer, the middleware boundary is probably too vague.

## Lower-Priority / Taste-Level Directions (Not Tutorial Design30)

These came up while writing the sandbox and subagent tutorials. They are
deliberately kept *out* of the tutorials' `Design30` callouts, because those
callouts are reserved for problems the current design actually has — a present
gap, risk, or coupling that blocks something real. The items below are closer
to "this could be more elegant / more symmetric." Recorded here so the
distinction stays visible and nothing is lost.

The bar used to decide:

```text
qualifies for tutorial Design30:
  - a present gap/risk            (e.g. host bash = static switch, an authz gap)
  - a present coupling/arch debt  (e.g. subagent_enabled couples capability with
                                   tool visibility; sandbox_id overloads identity
                                   with physical-resource locator)
    test: does the coupling block something you actually want to do? if yes -> debt

stays here instead (taste-level):
  - "could be cleaner / more symmetric", but nothing is broken today and no real
    need is blocked
```

### Sandbox: A Resource Lifecycle Model (Taste-Level Half)

The *real-debt* half of this already made it into the sandbox tutorial as a
Design30: `sandbox_id` is overloaded — it is both the logical identity bound to
a thread and the physical resource locator, forced equal by
`sha256(thread_id)[:8]`. That coupling blocks "recycle/rebuild the physical
container while keeping a stable logical identity" and "migrate a thread to a
different container", so it qualifies as debt.

The taste-level residue is everything *around* that split:

```text
today:
  identity-vs-resource coordination is woven through the provider's acquire
  fallback chain — process lock, active cache, deterministic id, warm pool,
  cross-process file lock, discover, create, idle checker

taste-level wish:
  a first-class resource lifecycle model where warm pool, cross-process reuse,
  and reclamation hang off an explicit state machine instead of an acquire
  fallback chain
```

Why this stays taste-level: the acquire chain is *complexity concentration*,
not harmful coupling. Concentrating cache/warm-pool/lock/idle logic inside one
provider is arguably appropriate cohesion. Nothing is broken; it just reads as
"a lot happening in one method." Only the `sandbox_id` overload blocks a real
need, and that part is already a Design30.

### Subagent: Execution As A First-Class Background Job (Taste-Level)

2.x runs a subagent by hand-weaving:

```text
task_tool coroutine on the main loop (5s polling, non-blocking)
  -> _scheduler_pool thread (returns task_id immediately)
     -> run_coroutine_threadsafe onto a persistent isolated event loop
        (reused across tasks, on its own daemon thread)
shared blackboard: _background_tasks[task_id] -> SubagentResult
cooperative cancel via threading.Event; terminal-status race resolved by a lock
```

Taste-level wish: promote subagent execution to a first-class background job —
schedulable, observable, cancellable — with its own state machine and event
stream, replacing the manual thread/loop/poll layer.

Why this stays taste-level rather than tutorial Design30:

```text
cancellation latency
  is largely a Python constraint (a running thread cannot be force-killed), not
  a design mistake. cooperative cancel at astream iteration boundaries is the
  honest tradeoff: cancel has delay, but state stays clean. "fixing" it is not
  obviously cheaper or safer.

cross-process invisibility
  IS a real limitation (a background subagent is only visible inside the worker
  that launched it), but it is lower-priority and overlaps the broader
  best-effort-in-memory-state issue already discussed for loop detection,
  circuit breaker, and memory debounce.
```

So the honest read: the *mechanism* is not wrong, it is flattened by the
current LangGraph runtime constraints. A 3.0 job model would untangle it, but
nothing here blocks a concrete need today the way the `subagent_enabled`
capability/visibility coupling does — and that coupling is already a Design30.
