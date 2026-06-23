# Middleware Pipeline

## One-line Mental Model

Middleware is DeerFlow's run-time behavior layer around the LangGraph agent loop. It does not replace the graph; it wraps model calls, tool calls, and agent completion to inject context, prepare runtime resources, normalize errors, update UI-facing state, and trigger background side effects.

## System Position

Upstream:

- `_make_lead_agent()` in `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- `create_agent(..., middleware=..., state_schema=ThreadState)`

Downstream:

- LangChain/LangGraph middleware hooks
- model call handler
- tool call handler
- DeerFlow sandbox, memory, title, upload, deferred-tool, and clarification subsystems

Main shape:

```text
_make_lead_agent()
  -> _build_middlewares()
  -> create_agent(..., middleware=middlewares, state_schema=ThreadState)
  -> LangGraph agent loop
  -> middleware wraps model/tool/after-agent stages
```

Middleware belongs to the agent execution layer, not the outer Gateway `RunManager`. `RunManager` manages a run as a backend task; middleware changes how one agent graph execution behaves.

## ThreadState

`ThreadState` is the LangGraph state schema used by DeerFlow's lead agent.

It extends LangChain's `AgentState`, so `messages` is inherited even though it is not declared directly in `ThreadState`.

Important fields:

```python
class ThreadState(AgentState):
    sandbox: NotRequired[SandboxState | None]
    thread_data: NotRequired[ThreadDataState | None]
    title: NotRequired[str | None]
    artifacts: Annotated[list[str], merge_artifacts]
    todos: Annotated[list | None, merge_todos]
    uploaded_files: NotRequired[list[dict] | None]
    viewed_images: Annotated[dict[str, ViewedImageData], merge_viewed_images]
    promoted: Annotated[PromotedTools | None, merge_promoted]
```

Mental model:

```text
messages       conversation and tool messages
sandbox        where execution happens
thread_data    where this thread's files live
title          UI title
artifacts      output files visible to frontend
todos          planning state
uploaded_files input files attached by user
viewed_images  image payloads made available to model
promoted       deferred tools promoted by tool_search
```

## Reducers

Reducers decide how multiple state updates to the same field are merged.

For example:

```python
artifacts: Annotated[list[str], merge_artifacts]
```

means updates such as:

```python
Command(update={"artifacts": ["outputs/report.md"]})
```

do not blindly overwrite `artifacts`. LangGraph looks at the `ThreadState` schema and calls `merge_artifacts(old, new)`.

The `Command` only says "update this field." The reducer is not specified inside `Command`; it is selected from the state schema.

## Main Flow

The lead agent builds middleware in layers:

```text
runtime middleware
  -> tool output budget
  -> thread data
  -> uploads
  -> sandbox
  -> dangling tool call patch
  -> LLM error handling
  -> optional guardrail
  -> sandbox audit
  -> tool error handling

lead-agent middleware
  -> dynamic context
  -> summarization
  -> todo
  -> token usage
  -> title
  -> memory
  -> view image
  -> deferred tool filter
  -> subagent limit
  -> loop detection
  -> custom middleware
  -> safety finish reason
  -> clarification
```

The order matters because middleware is an onion around model/tool execution. A later middleware may depend on state prepared by an earlier one, and error/interrupt middleware must sit at the right boundary.

## Middleware Categories

Do not read all middleware as the same kind of object. In DeerFlow, middleware is a shared mechanism used for several different jobs.

### State Preparers

These middleware prepare durable runtime state before model/tool execution:

```text
ThreadDataMiddleware -> thread_data
SandboxMiddleware    -> sandbox
UploadsMiddleware    -> uploaded_files + model-visible upload context
```

They answer:

```text
What file paths, sandbox, and user inputs does this run have?
```

### Model-Visible Context Projectors

These middleware turn hidden runtime state into messages the model can read:

```text
DynamicContextMiddleware -> date + memory reminders
TodoMiddleware           -> active todo reminder after context loss
ViewImageMiddleware      -> viewed image data as multimodal message
SkillActivationMiddleware -> full SKILL.md for explicit /skill activation
```

They answer:

```text
What important runtime state would the model otherwise not see?
```

### Context Budget Managers

These middleware keep the model context from growing without bound:

```text
DeerFlowSummarizationMiddleware -> compress old messages into summary
ToolOutputBudgetMiddleware      -> externalize or truncate large tool outputs
```

They answer:

```text
What should stay in context, what should be summarized, and what should move to files?
```

### Policy And Safety Enforcers

These middleware enforce runtime rules that should not rely only on prompt obedience:

```text
DeferredToolFilterMiddleware -> hide unpromoted deferred tools
SubagentLimitMiddleware      -> cap task tool fan-out
LoopDetectionMiddleware      -> stop repetitive tool loops
SafetyFinishReasonMiddleware -> suppress unsafe partial tool calls
SandboxAuditMiddleware       -> block or warn on risky bash commands
```

They answer:

```text
What is the model not allowed to do, even if it tries?
```

### Error And Control-Flow Adapters

These middleware translate exceptional situations into graph-safe outputs:

```text
DanglingToolCallMiddleware  -> repair invalid message history
ToolErrorHandlingMiddleware -> convert tool exceptions into ToolMessage errors
LLMErrorHandlingMiddleware  -> retry/fallback on provider failures
ClarificationMiddleware     -> turn ask_clarification into Command(goto=END)
TodoMiddleware              -> jump back to model when todos are incomplete
```

They answer:

```text
How should the agent loop continue or stop when something unusual happens?
```

### Observability And Side Effects

These middleware support UI, logs, metrics, and background state:

```text
TitleMiddleware      -> generate thread title
TokenUsageMiddleware -> annotate AI steps and token attribution
MemoryMiddleware     -> enqueue background memory updates
```

They answer:

```text
What should the system record or update outside the model's reasoning path?
```

## Middleware Read So Far

Current reading status:

```text
Covered at overview level:
  ThreadDataMiddleware
  UploadsMiddleware
  SandboxMiddleware
  DanglingToolCallMiddleware
  ToolErrorHandlingMiddleware
  DynamicContextMiddleware
  TitleMiddleware
  MemoryMiddleware + MemoryUpdateQueue
  DeerFlowSummarizationMiddleware

Covered in source-reading detail:
  TodoMiddleware
  ViewImageMiddleware

Next detailed reads:
  DeferredToolFilterMiddleware
  SubagentLimitMiddleware
  LoopDetectionMiddleware
  ClarificationMiddleware
  ToolOutputBudgetMiddleware
  LLMErrorHandlingMiddleware
  SandboxAuditMiddleware
  SafetyFinishReasonMiddleware
```

### ThreadDataMiddleware

Responsibility:

```text
prepare per-thread file path context
```

Writes:

- `thread_data`

This is the file-system side of a thread: workspace path, uploads path, outputs path.

### UploadsMiddleware

Responsibility:

```text
convert uploaded file metadata from the latest user message into model-visible context
```

Reads:

- latest `HumanMessage`
- `additional_kwargs["files"]`
- thread upload directory

Writes:

- `uploaded_files`
- patched `messages`

Important detail: it does not upload files itself. The frontend/Gateway has already placed files in the thread upload area. This middleware makes those files visible to the model in the current run.

It patches the latest human message because the current run is triggered by the latest user input, and the attached files semantically belong to that input.

### SandboxMiddleware

Responsibility:

```text
prepare or acquire the sandbox used by tools
```

Writes:

- `sandbox`

This separates "where files live" from "where commands execute":

```text
thread_data -> file paths
sandbox     -> execution environment
```

More precisely:

```text
SandboxMiddleware = execution-context binder
```

It does not execute commands. It prepares and persists the identity of the execution
environment that sandbox tools will later use.

The state shape is nested:

```python
class SandboxState(TypedDict):
    sandbox_id: NotRequired[str | None]

runtime.state["sandbox"] = {"sandbox_id": "local:thread-123"}
```

`runtime.state` is the current tool invocation's graph-state instance. `ThreadState` is
the schema/type definition for that graph state. In DeerFlow tools:

```python
Runtime = ToolRuntime[dict[str, Any], ThreadState]
```

means:

```text
runtime.context: dict[str, Any]
runtime.state: ThreadState
```

The `sandbox` field is wrapped as a sub-dict rather than a top-level `sandbox_id` so the
sandbox namespace can grow without scattering related fields across the top-level graph
state:

```text
sandbox_id
provider
scope
created_at
lease_id
capabilities
```

Only `sandbox_id` exists today, but the boundary is already visible.

Tool execution path:

```text
model emits bash tool call with args.command
  -> ToolNode calls bash_tool(runtime=..., command=...)
  -> bash_tool calls ensure_sandbox_initialized(runtime)
  -> ensure_sandbox_initialized reads runtime.state["sandbox"]["sandbox_id"]
  -> get_sandbox_provider().get(sandbox_id)
  -> returns a Sandbox instance
  -> bash_tool calls sandbox.execute_command(command)
```

The model-generated `command` is not a LangGraph state field. It is part of the
`AIMessage.tool_calls` payload:

```text
AIMessage.tool_calls[0].args.command
```

It has no independent reducer. The reducer applies to `messages`, not to the nested
`command` value as its own state channel.

`provider` here means "backend capability implementation", not necessarily model
provider. DeerFlow has different provider families:

```text
model provider
  -> model calls

sandbox provider
  -> execution environment acquisition and lookup
```

A sandbox provider is roughly:

```text
acquire(thread_id) -> sandbox_id
get(sandbox_id) -> Sandbox instance
release(sandbox_id)
shutdown()
```

The `Sandbox` instance is the object that implements the execution API:

```python
execute_command(command)
read_file(path)
write_file(path, content)
list_dir(path)
grep(...)
glob(...)
```

For `LocalSandboxProvider`, "local" means local filesystem/tool-execution provider, not
local model provider.

Local sandbox behavior:

```text
model/tool path:
  /mnt/user-data/workspace/foo.py

LocalSandbox path mapping:
  /mnt/user-data/workspace/foo.py
  -> host/gateway-visible thread workspace path

command execution:
  subprocess.run([shell, "-c", resolved_command], capture_output=True)

output:
  host paths are reverse-mapped/masked back to /mnt/user-data/...
```

So local sandbox is not a strong isolation boundary. It is a local execution adapter with
path mapping, validation, output masking, and thread-scoped directories. Host bash is
disabled by default because it means host shell execution permission, not merely network
permission.

Container-based sandbox behavior is configured by selecting a non-local provider such as:

```yaml
sandbox:
  use: deerflow.community.aio_sandbox:AioSandboxProvider
```

From the config and Docker overlay docs, this can run in at least two modes:

```text
pure Docker / DooD
  gateway can access a Docker daemon
  provider starts per-thread sandbox containers through that daemon

provisioner / Kubernetes
  gateway calls provisioner_url
  provisioner creates sandbox pods and returns a sandbox endpoint/handle
```

Where the sandbox runs depends on where the DeerFlow gateway runs and what backend the
configured provider can reach:

```text
local dev gateway + Docker
  -> local machine's Docker/Container runtime

server gateway + Docker
  -> server's Docker daemon

gateway + provisioner_url
  -> provisioner-managed Kubernetes/Docker environment
```

Virtual paths matter because they give the model and tools a stable filesystem API:

```text
/mnt/user-data/workspace
/mnt/user-data/uploads
/mnt/user-data/outputs
```

The same virtual path can map to:

```text
host paths in LocalSandbox
container mounts in Aio/container sandbox
PVC-backed pod paths in provisioner mode
```

This is useful for portability and output hygiene, but it is not a complete security
boundary. Hiding `/Users/...` from the model does not by itself prevent dangerous
execution. Safety comes from the provider's isolation level, path validation, mount
policy, tool allowlists, and host-bash policy.

Lazy initialization:

```text
lazy_init=True
  -> before_agent does not acquire a sandbox
  -> first sandbox tool call acquires one
```

The subtle part is that sandbox tools can mutate:

```python
runtime.state["sandbox"] = {"sandbox_id": sandbox_id}
```

but direct mutation of `runtime.state` is local to the tool invocation unless it is
returned through LangGraph's update channel. `SandboxMiddleware.wrap_tool_call()` detects
the transition:

```text
prev_sandbox_id = None
handler(request) lazily initializes sandbox
curr_sandbox_id = "..."
```

and wraps/merges the result into:

```python
Command(update={
    "sandbox": {"sandbox_id": sandbox_id},
    "messages": [tool_message],
})
```

so the official graph state, reducers, and checkpoint/resume path can observe the new
sandbox id.

Lifecycle nuance:

```text
after_agent -> provider.release(sandbox_id)
```

does not always mean "destroy the sandbox." `LocalSandboxProvider.release()` is a no-op,
so local per-thread sandboxes can be reused. Other providers may close a client, return a
container to a pool, or destroy resources. The lifecycle semantics live in the provider,
not in `SandboxMiddleware` alone.

Subagent inheritance:

```text
task_tool reads parent runtime.state["sandbox"]
task_tool reads parent runtime.state["thread_data"]
task_tool passes both into SubagentExecutor
SubagentExecutor seeds subagent initial state with them
```

So DeerFlow subagents:

```text
isolate reasoning context
inherit execution context
```

Short teaching phrase:

```text
Subagents isolate the brain, but share the workbench.
```

Design risks:

- local sandbox can be mistaken for a strong security boundary
- `release` has provider-specific meanings
- `sandbox_id` is nested under `sandbox`, but the substate currently carries only one field
- local cache reuse depends on thread/user ownership semantics being correct

Design lessons:

```text
ToolRuntime.state is a graph-state instance; ThreadState is its schema.
Sandbox id is state; Sandbox instance is provider-owned resource.
Virtual paths are a portability and hygiene layer, not security by themselves.
Provider isolation level must be explicit.
```

### DanglingToolCallMiddleware

Responsibility:

```text
patch malformed message history before the next model call
```

It protects provider APIs from message sequences like:

```text
AIMessage(tool_calls=[...])
missing ToolMessage for one of those calls
```

It patches `request.messages` for the model call. This is runtime repair, not necessarily a durable state mutation.

The core algorithm is:

```text
1. Build an index of existing ToolMessages
   tool_messages_by_id: dict[tool_call_id, deque[ToolMessage]]

2. Collect every tool-call id declared by AIMessages
   tool_call_ids: set[str]

3. Rebuild a new patched message list
   - skip ToolMessages at their old positions
   - when an AIMessage is appended, immediately append the matching ToolMessages
   - if no matching ToolMessage exists, append a synthetic ToolMessage(status="error")
```

The important source line is:

```python
tool_messages_by_id[msg.tool_call_id].append(msg)
```

This is not a function call into runtime. It is normal dictionary indexing:

```text
key:
  ToolMessage.tool_call_id

value:
  deque of ToolMessages for that tool_call_id
```

Later, when rebuilding messages, the middleware uses each `AIMessage.tool_calls[*].id`
to look up the corresponding queue:

```python
tool_msg_queue = tool_messages_by_id.get(tc_id)
existing_tool_msg = tool_msg_queue.popleft() if tool_msg_queue else None
```

That is how ordering is repaired:

```text
old:
  HumanMessage("A")
  AIMessage(tool_calls=[call_1])
  HumanMessage("B")
  ToolMessage(tool_call_id=call_1)

patched:
  HumanMessage("A")
  AIMessage(tool_calls=[call_1])
  ToolMessage(tool_call_id=call_1)
  HumanMessage("B")
```

So the essence is:

```text
index first, rebuild second
```

`_message_tool_calls()` also normalizes three possible sources:

```text
msg.tool_calls
msg.additional_kwargs["tool_calls"]
msg.invalid_tool_calls
```

This matters because provider adapters may leave raw or invalid tool-call
metadata on the message. Even invalid tool calls may still require a matching
`ToolMessage` when the next request is serialized for a strict provider.

Boundary:

```text
DanglingToolCallMiddleware:
  model provider message protocol repair

ToolErrorHandlingMiddleware:
  real tool execution exception -> ToolMessage(status="error")

SafetyFinishReasonMiddleware:
  provider safety stop -> suppress tool_calls before ToolNode
```

### SandboxAuditMiddleware

Responsibility:

```text
audit and gate bash command execution before the real bash tool runs
```

Hook:

```text
wrap_tool_call / awrap_tool_call
```

It only handles tool calls whose name is `bash`:

```python
if request.tool_call.get("name") != "bash":
    return handler(request)
```

For bash calls, it reads `args["command"]`, validates the input, classifies the
command, writes an audit log, and then chooses one of three paths:

```text
pass:
  call handler(request)
  real bash tool executes normally

warn:
  call handler(request)
  real bash tool executes
  append a warning to ToolMessage.content

block:
  do not call handler(request)
  return ToolMessage(status="error")
  real bash tool never executes
```

The key safety property is:

```text
block returns before handler(request)
```

Since the real tool execution is inside the handler chain, a blocked command is
never executed.

Command classification is deliberately simple:

```text
input validation:
  empty command / too long / null byte -> block

high-risk regex/shlex patterns:
  rm -rf /, dd if=, mkfs, curl | bash, /dev/tcp, fork bomb, etc. -> block

medium-risk patterns:
  pip install, apt install, chmod 777, sudo/su, PATH= -> warn
```

This is not a complete sandbox. It is a bash command policy filter:

```text
SandboxMiddleware:
  decides where command execution happens

SandboxAuditMiddleware:
  decides whether this bash command should be allowed to execute
```

Audit logs are written through the standard logger for every bash call:

```text
timestamp
thread_id
command
verdict: pass / warn / block
```

This is lowest-cost safety observability. It helps debug why a command was
blocked, inspect likely false positives/false negatives, and trace what bash
commands a thread attempted. It is not a full productized audit system by itself.

### GuardrailMiddleware

Responsibility:

```text
optional runtime authorization for tool calls through a pluggable provider
```

This middleware is not part of the default mainline unless guardrails are
configured:

```text
guardrails.enabled = true
guardrails.provider = ...
```

It lives outside `agents/middlewares/`:

```text
deerflow/guardrails/middleware.py
```

Hook:

```text
wrap_tool_call / awrap_tool_call
```

It builds a `GuardrailRequest` from the tool call:

```text
tool_name
tool_input
agent_id/passport
timestamp
```

Then it asks a `GuardrailProvider` for an allow/deny decision:

```text
allow:
  call handler(request)

deny:
  do not call handler(request)
  return ToolMessage(status="error")
```

The built-in `AllowlistProvider` overlaps with existing tool-name allow/deny
configuration, so it is not a major mainline capability by itself. The stronger
enterprise use case is runtime authorization:

```text
allowed-tools:
  static tool-name exposure policy
  decides what the model can see/use in principle

GuardrailMiddleware:
  execution-time policy
  decides whether this concrete tool call with these arguments is allowed now
```

Useful enterprise examples:

```text
allow read_file but deny path=/secrets/*
allow send_email but deny external recipients
allow GitHub read tools but deny merge/delete actions for normal users
deny webhook/http calls that would exfiltrate sensitive data
require special agent_id/passport for deploy/refund/delete tools
```

Current limitation:

```text
GuardrailRequest defines thread_id and is_subagent,
but the current middleware only fills tool_name, tool_input, agent_id, timestamp.
```

So this should be taught as a reserved extension point:

```text
valuable when backed by real enterprise policy providers;
otherwise mostly overlaps with static tool allowlists.
```

### SafetyFinishReasonMiddleware

Responsibility:

```text
suppress tool execution when the provider safety-terminated a model response
```

This middleware is not a safety classifier. It does not decide whether content is
safe. It consumes provider stop signals already attached to the `AIMessage`.

Examples:

```text
OpenAI-compatible:
  finish_reason = content_filter

Anthropic:
  stop_reason = refusal

Gemini:
  finish_reason = SAFETY / BLOCKLIST / PROHIBITED_CONTENT / SPII / RECITATION
```

`SafetyTerminationDetector` is the adapter layer:

```text
provider-specific safety finish reason
  -> SafetyTermination(detector, reason_field, reason_value, extras)
```

The main middleware logic is:

```text
model returns AIMessage normally
  -> after_model checks the latest AIMessage
  -> if safety termination exists and tool_calls is non-empty
  -> clear tool_calls
  -> append a user-visible explanation
  -> record observability metadata
```

This is why it lives in `after_model`, not `wrap_model_call`. A provider safety
finish reason is usually a successful API response, not a Python exception:

```text
LLMErrorHandlingMiddleware:
  handles failure to get a normal AIMessage from the provider

SafetyFinishReasonMiddleware:
  handles a normal AIMessage whose tool_calls are not trustworthy
```

The "partial tool arguments" case is easiest to understand with `write_file`:

```text
tool_call args:
  path = /mnt/user-data/outputs/report.md
  content = "# Report\n\ntext generated until the provider stopped..."
```

For `write_file`, the dangerous part is usually a partial `content` field. At
the protocol level, that is still a partial tool-call argument. Other tools may
have partial `command`, `query`, or other argument fields.

Clearing tool calls matters because LangGraph/LangChain routes any `AIMessage`
with non-empty `tool_calls` to ToolNode. If the safety-stopped tool call is left
in place, ToolNode may execute truncated arguments.

Besides clearing `tool_calls`, the middleware records observability:

```text
metadata:
  writes additional_kwargs["safety_termination"] on the patched AIMessage

SSE event:
  emits a live safety_termination event so the frontend can reconcile UI state

audit event:
  writes a persistent middleware:safety_termination record for later debugging
```

These are secondary. The main business behavior is still:

```text
safety finish reason + tool_calls
  -> suppress the tool calls before ToolNode can execute them
```

### ToolErrorHandlingMiddleware

Responsibility:

```text
turn normal tool exceptions into ToolMessage(status="error")
```

It sits around tool execution:

```text
ToolErrorHandlingMiddleware
  -> handler(request)
     -> later tool-call middlewares
        -> real BaseTool.invoke / ainvoke
```

`handler(request)` means "continue to the next layer." The middleware enters first,
hands control to the inner layers, and then sees either the returned result or any
exception that bubbles back out.

Normal tool exceptions are ordinary Python `Exception`s raised by a tool or one of its
dependencies:

```text
FileNotFoundError
TimeoutError
RuntimeError
PermissionError
ValueError
...
```

The exact exception type and message are decided by the tool implementation or the
underlying library. This middleware decides which exceptions become protocol-safe tool
results:

```python
try:
    result = handler(request)
except GraphBubbleUp:
    raise
except Exception as exc:
    return self._build_error_message(request, exc)
```

The `GraphBubbleUp` branch is important. It is a LangGraph control-flow signal for
interrupt/pause/resume behavior, not a normal tool failure. Turning it into
`ToolMessage(status="error")` would disguise runtime control flow as business failure.

For ordinary exceptions, the middleware builds:

```python
ToolMessage(
    content="Error: Tool '...' failed with ...",
    tool_call_id=tool_call_id,
    name=tool_name,
    status="error",
)
```

This preserves the provider/tool-calling protocol:

```text
AIMessage(tool_calls=[call_x])
  -> ToolMessage(tool_call_id=call_x, status="error")
```

That is not only provider compatibility. It is also graph resume hygiene. A checkpoint
with a dangling tool call is ambiguous:

```text
Was the tool never executed?
Did it fail?
Was the result lost?
```

An explicit error `ToolMessage` makes the state self-consistent and lets the next model
turn recover with full context.

This middleware also normalizes `task` tool results. `task` is the lead agent's
subagent-entry tool, so its result doubles as the subagent lifecycle signal. Rather than
forcing the frontend to parse strings such as:

```text
Task Succeeded. Result:
Task failed.
Task timed out
```

the middleware stamps structured metadata onto task tool messages:

```text
additional_kwargs["subagent_status"] = "completed" | "failed" | "timed_out" | ...
additional_kwargs["subagent_error"] = "RuntimeError: ..."  # when available
```

So the responsibility is really twofold:

```text
all tools
  -> uncaught ordinary exception becomes ToolMessage(status="error")

task tool only
  -> terminal subagent text becomes structured subagent_status metadata
```

Design lesson:

```text
Tool functions should focus on domain behavior.
The execution boundary should normalize uncaught failures into protocol-valid results.
Control-flow signals must remain control-flow signals.
UI state should use structured metadata, not natural-language prefixes.
```

### DynamicContextMiddleware

Responsibility:

```text
inject dynamic reminders without constantly rewriting the static system prompt
```

Reads:

- current date
- memory context
- existing messages

Writes:

- patched `messages`

It adds hidden human messages with markers such as `hide_from_ui` and `dynamic_context_reminder`.

The engineering reason is practical: keep the system prompt stable for provider prefix caching, while still giving the model fresh runtime context.

Important distinction:

```text
system_prompt
  static prompt template passed to the model

runtime context
  request/run metadata available to middleware and tools

graph state messages
  durable LangGraph conversation state managed by message reducers

model-visible reminder
  hidden-from-UI HumanMessage inserted into messages
```

`DynamicContextMiddleware` does not mutate the static system prompt. It projects
dynamic information into the model-visible message history by inserting a
separate `HumanMessage` whose content is wrapped in `<system-reminder>...</system-reminder>`.
The tag is plain message content, not a real `SystemMessage` role.

First-turn injection uses an ID-swap pattern:

```text
before:
  [original_id: user prompt]

after:
  [original_id: hidden system-reminder]
  [original_id__user: user prompt]
```

The reminder reuses the original message ID so the message reducer replaces the
original message in place. The original user content is preserved in a derived
message ID and appears immediately after the reminder.

This gives three properties:

```text
the reminder appears before the user prompt
the original user prompt is not polluted
the injected dynamic context is persisted in graph state
```

Injection behavior:

```text
first turn:
  inject memory + current date before the first real user message

same day:
  inject nothing

date changed:
  inject a date-only reminder before the latest real user message
```

Memory is treated as a frozen conversation snapshot. Date is allowed to receive a
small correction when the conversation crosses midnight.

The async path wraps injection with:

```python
await asyncio.wait_for(asyncio.to_thread(self._inject, state), timeout=5.0)
```

Reason: building memory context may perform synchronous file I/O or cold-start
tokenizer/network work. Offloading prevents the async event loop from being
blocked. The timeout makes dynamic context a best-effort enhancement rather than
a single point of request failure.

3.0 design note:

```text
date injection and memory injection are different reliability classes

date:
  cheap local runtime fact

memory:
  potentially slow storage/tokenizer work
```

They could be separated so a memory timeout does not also skip the current date.

### SkillActivationMiddleware

Responsibility:

```text
turn explicit /skill-name input into model-visible skill context
```

Reads:

- latest real user `HumanMessage`
- installed skill metadata
- `SKILL.md` content
- current agent's available skill set

Writes:

- a modified `ModelRequest.messages` for the current model call only
- no durable graph-state message update

Trigger:

```text
/skill-name task text
```

`slash` means the `/` character, so a slash skill is a skill activated by an
explicit leading `/skill-name` command.

The design is metadata-first:

```text
default system prompt:
  only skill metadata

explicit slash activation:
  inject full SKILL.md for this turn
```

This keeps the base system prompt small and cacheable while still honoring a
user's explicit skill choice.

The middleware validates activation before reading content:

```text
parse /skill-name
load installed skills
check installed
check enabled
check available to this agent
resolve container-visible skill path
read host SKILL.md safely
hash content for audit
```

Path safety matters because a path can look like it lives under the skills root
while resolving elsewhere through `..` or filesystem symlinks. DeerFlow defends
in layers:

```text
skill archive install:
  reject absolute paths and parent-directory traversal
  skip symlink entries

skill support-file writes:
  resolve target path
  ensure target remains inside the allowed skill directory

slash activation read:
  resolve SKILL.md
  ensure resolved file remains inside the configured skills root
```

The injected reminder is an XML-like prompt envelope:

```text
<slash_skill_activation>
  <user_request>...</user_request>
  <skill name="..." category="..." path="..." sha256="...">
    <skill_content encoding="xml-escaped">...</skill_content>
  </skill>
</slash_skill_activation>
```

`xml-escaped` means the embedded `SKILL.md` text has had characters such as
`<`, `>`, and `&` escaped. DeerFlow uses Python's `html.escape()` for this. The
purpose is to keep tags inside the skill document from breaking the middleware's
outer prompt envelope.

Hook choice:

```text
DynamicContextMiddleware:
  before_agent
  writes durable graph state
  conversation-level context

SkillActivationMiddleware:
  wrap_model_call
  overrides only current ModelRequest
  turn-local context
```

This difference is intentional. Dynamic date/memory context belongs in the
conversation history. Full skill content belongs only to turns where the user
explicitly typed `/skill-name`.

Failure handling can short-circuit the model call:

```text
missing skill
disabled skill
agent cannot use skill
unsafe load failure
```

These are deterministic system facts, so the middleware returns its own
`AIMessage` instead of spending a model request.

The async hook uses `asyncio.to_thread()` to offload skill-storage and file-read
work to the default thread pool. This avoids blocking the async event loop with
synchronous filesystem I/O.

General principle:

```text
role solves protocol compatibility
content envelope solves model interpretation
metadata solves runtime/UI/middleware control
```

In other words:

```text
role:
  make the message fit the LangChain/LangGraph message protocol
  example: HumanMessage

content envelope:
  explain the message's business meaning to the model
  example: <slash_skill_activation>...</slash_skill_activation>

metadata:
  support deterministic system decisions
  example: hide_from_ui, slash_skill_activation, slash_skill_activation_target_id
```

The middleware does not detect prior injection by searching for
`<slash_skill_activation>` in text. It uses metadata such as
`slash_skill_activation` and `slash_skill_activation_target_id` so user-provided
text cannot impersonate an internal reminder.

### SummarizationMiddleware

Responsibility:

```text
persistently compress long conversation history into summary + recent messages
```

Reads:

- `messages`
- token count
- configured summarization thresholds
- optional before-summarization hooks

Writes:

- a durable replacement of graph-state `messages`

The core state update is not an append:

```python
{
    "messages": [
        RemoveMessage(id=REMOVE_ALL_MESSAGES),
        *new_messages,
        *preserved_messages,
    ]
}
```

This means:

```text
remove all old messages
write one summary message
write back preserved recent messages
```

So summarization is a graph-state compression step, not a turn-local request
overlay.

The generated summary is:

```python
HumanMessage(
    content="Here is a summary of the conversation to date:\n\n...",
    name="summary",
)
```

This is intentionally split across three semantic layers:

```text
role:
  HumanMessage, so the model can read it as conversational context

content envelope:
  "Here is a summary of the conversation to date", so the model treats it as
  background rather than a new user task

metadata/name:
  name="summary", so runtime and middleware do not treat it as real user input
```

The summary must not be treated as real user input because many middleware make
decisions from message order and message type. If `name="summary"` were ignored,
later middleware could mistake the summary for a user-authored prompt, inject
context in the wrong place, trigger slash-skill parsing on generated text, or
pollute UI/product semantics.

There are two separate UI protections:

```text
summary message:
  marked as name="summary" so it can be hidden or skipped as internal context

summary model call:
  uses TAG_NOSTREAM so the internal summary-generation tokens are not streamed
  to the frontend as a phantom assistant reply
```

`TAG_NOSTREAM` is attached through a dedicated summary model binding:

```python
self._summary_model = self.model.with_config(tags=merged_tags)
```

This does not require a completely separate underlying model provider. It creates
a separate model-call entrypoint with different fixed config. The important
engineering point is that DeerFlow does not temporarily mutate the shared
`self.model` field during an async run.

Reason:

```text
middleware instances may be reused across concurrent runs

if one run temporarily changes self.model to a nostream model and then awaits,
another run can observe that temporary shared state and lose normal streaming
```

So DeerFlow keeps:

```text
self.model:
  normal model-call entrypoint

self._summary_model:
  summary-only model-call entrypoint with TAG_NOSTREAM
```

The underlying provider can still be reused; the mutable call configuration is
not shared.

Retention strategy:

```text
base strategy:
  let the parent SummarizationMiddleware split messages by trigger/keep policy

DeerFlow extension:
  rescue recent skill-read bundles from the old region before summarization
```

The `trigger` config decides when summarization runs. The `keep` config decides
how much recent context is preserved after summarization. Both can be expressed
as:

```text
messages
tokens
fraction of model context window
```

So the first partition is a recency window:

```text
old region:
  messages_to_summarize

recent region:
  preserved_messages
```

DeerFlow then applies a second, structure-aware pass. If the old region contains
recent tool calls that read skill files under `/mnt/skills`, those AIMessage /
ToolMessage pairs may be moved back into `preserved_messages`.

Why this matters:

```text
old does not always mean disposable
recent does not always mean sufficient
```

Skill files are execution context. Compressing them into a loose summary can
remove exact instructions, constraints, paths, and resource-loading rules that
the model still needs to follow.

The rescue policy is budgeted:

```text
preserve_recent_skill_count:
  maximum number of distinct recent skill bundles to rescue

preserve_recent_skill_tokens:
  total token budget for rescued skill tool results

preserve_recent_skill_tokens_per_skill:
  per-skill cap; oversized skill reads are not rescued
```

This keeps summarization from being defeated by preserving every old large tool
result.

Design principle:

```text
Summarization is selective loss, not generic compression.
```

Good agent summarization must distinguish:

```text
lossy context:
  ordinary discussion that can become prose summary

executable context:
  exact instructions, schemas, tool results, file contents, active constraints,
  and provider-required tool-call/message pairings
```

Current DeerFlow implements a focused version of this idea for skill reads. A
more general future design would extract structured context items first, then
apply a retention policy.

### TokenUsageMiddleware

Responsibility:

```text
annotate model steps with token usage and product-level attribution
```

Hook:

```text
after_model / aafter_model
```

Reads:

- last `AIMessage`
- `AIMessage.usage_metadata`
- `AIMessage.tool_calls`
- current `todos`
- cached subagent usage by `tool_call_id`

Writes:

- updated `AIMessage.additional_kwargs`
- merged `AIMessage.usage_metadata` when subagent usage is available

This middleware is primarily an observability layer. It does not execute tools,
start subagents, or change model behavior.

Token usage source:

```text
model provider response
  -> model adapter
  -> AIMessage.usage_metadata
  -> TokenUsageMiddleware
```

If a provider does not return usage, this middleware does not invent exact token
counts. It reads the usage metadata already attached to the message.

Attribution source:

```text
AIMessage.tool_calls
  -> _describe_tool_call(...)
  -> actions
  -> _infer_step_kind(...)
  -> token_usage_attribution
```

`actions` are not generated by the model directly. They are runtime/product
semantics derived from raw tool calls.

Examples:

```text
write_todos:
  todo_start / todo_complete / todo_update / todo_remove

task:
  subagent

web_search / image_search:
  search

ask_clarification:
  clarification

unknown tool:
  tool
```

`write_todos` is special because one tool call can produce multiple product
actions. A single todo-list rewrite might complete one todo, start another, and
remove a third. Therefore `_describe_tool_call()` returns a list of actions, and
the caller uses `actions.extend(...)` instead of `append(...)`.

Todo diff strategy:

```text
1. prefer matching previous and next todos by content
2. if content does not match, fall back to matching by index
3. any previous todo not matched is treated as removed
```

This is a practical heuristic because todo items do not currently have stable
runtime-owned IDs. Content is usually stable but can drift because it is
LLM-generated. A more robust design would use runtime-owned todo IDs and patch
operations instead of full-list diffing.

Step kind:

```text
single todo action:
  todo_update

single subagent action:
  subagent_dispatch

multiple actions or ordinary tools:
  tool_batch

no tools, text content:
  final_answer

no tools, no content:
  thinking
```

When a model response contains multiple tool calls, token usage belongs to the
whole model response. DeerFlow marks:

```text
shared_attribution = True
```

This is intentionally conservative: it avoids pretending the runtime can split a
single model-call token count precisely across several tool actions.

Subagent token usage is bridged through `tool_call_id`:

```text
parent AIMessage.tool_calls[].id
  -> task tool starts subagent
  -> task tool caches subagent usage by tool_call_id
  -> TokenUsageMiddleware sees matching ToolMessage
  -> pop_cached_subagent_usage(tool_call_id)
  -> merge usage back into the dispatch AIMessage
```

`pop` matters because it removes the cached value after reading it. This prevents
double-counting the same subagent usage.

The final annotation is written back onto the same `AIMessage`:

```python
updated_msg = last.model_copy(update={"additional_kwargs": additional_kwargs})
return {"messages": [updated_msg]}
```

`model_copy()` creates an updated message object instead of mutating the existing
state object in place. Because the copied message keeps the same message ID, the
LangGraph message reducer replaces the original message rather than appending a
new one.

Pattern:

```text
TokenUsageMiddleware = message annotation middleware

It does not create model-visible context.
It enriches existing messages with runtime-visible observability metadata.
```

## Reading Template For Remaining Middleware

For each middleware, read it through the same execution skeleton:

```text
What does it wrap?
  model call
  tool call
  fixed lifecycle point

Where does it act?
  handler-before logic
  handler-after logic
  exception path
  direct state lifecycle hook

What does it mutate or return?
  graph state
  ModelRequest
  ToolMessage / Command
  AIMessage metadata
  side effect only
```

For `wrap_*` hooks:

```text
handler(request) means "continue inward".

handler-before logic:
  executes outer -> inner

handler-after logic:
  executes inner -> outer after the real model/tool returns
```

This gives a stable way to classify the remaining runtime-protection
middlewares without re-learning the control flow each time.

### TitleMiddleware

Responsibility:

```text
generate a thread title once there is enough conversation context
```

Reads:

- `messages`
- existing `title`

Writes:

- `title`

It ignores hidden dynamic-context reminder messages, because those are implementation context rather than user conversation.

Hook:

```text
after_model / aafter_model
```

Trigger conditions:

```text
title config enabled
state["title"] is empty
messages has at least two entries
exactly one real user HumanMessage
at least one AIMessage
```

This means title generation happens after the first complete user/assistant
exchange, not before the assistant has answered.

`HumanMessage` is not enough to mean "real user input". The first turn may look
like:

```text
[hidden dynamic context reminder]  HumanMessage(id=original_id)
[user question]                    HumanMessage(id=original_id__user)
[assistant answer]                 AIMessage(...)
```

So `TitleMiddleware` excludes `is_dynamic_context_reminder(message)` when
counting user messages. Otherwise the hidden reminder would be counted as an
extra user message and title generation would not trigger.

Prompt construction:

```text
first real user message
first assistant message
strip <think>...</think> blocks from assistant text
truncate user and assistant text to 500 chars each
format configured title prompt
```

`_normalize_content()` handles message content that is not a plain string, such
as multimodal list/dict content. This keeps title generation based on readable
text instead of raw message objects.

Sync vs async behavior:

```text
sync after_model:
  does not call an LLM
  returns a local fallback title from the first user message

async aafter_model:
  creates a title model locally
  calls model.ainvoke(...)
  parses the response
  falls back to a local title on error
```

The title model call is an internal middleware LLM call. It is tagged through
RunnableConfig:

```text
run_name = title_agent
tags += ["middleware:title"]
```

This lets tracing / RunJournal attribute the call to title middleware rather than
the lead agent.

Unlike `SummarizationMiddleware`, this middleware does not need a persistent
`self._summary_model`-style field. It does not inherit a shared `self.model`, and
it does not temporarily mutate a shared model field. The async path creates a
local `model` variable for the title call and passes config at invocation time.

Reliability policy:

```text
title is nice-to-have
failure should not break the main run
fallback title is acceptable
```

State effect:

```text
return {"title": title}
```

It writes the thread title field. It does not create model-visible context and
does not modify `messages`.

### ToolOutputBudgetMiddleware

Responsibility:

```text
keep a single tool result from blowing up the model context
```

This middleware protects `ToolMessage.content`, not arbitrary file size. If a
tool writes a large file but returns only `"Successfully wrote file"`, there is
nothing to budget. If a tool returns a huge log, HTML page, grep result, JSON
payload, or command output directly in `ToolMessage.content`, this middleware
intervenes.

Hooks:

```text
wrap_tool_call:
  handler-after logic
  patch fresh ToolMessage / Command after the real tool returns

wrap_model_call:
  handler-before logic
  patch oversized historical ToolMessages before the model sees them
```

Primary flow:

```text
AIMessage.tool_calls
  -> real tool executes
  -> large ToolMessage
  -> middleware writes full content to output file when possible
  -> ToolMessage.content becomes head/tail preview + virtual path
  -> model can call read_file(path, start_line, end_line) if it needs more
```

The head/tail preview is not a semantic guarantee. It is a navigation signal:

```text
head:
  identify output type and starting structure

tail:
  expose final status, summary, or trailing error

path:
  allow on-demand retrieval of the full externalized output
```

So the preview answers:

```text
What is this externalized file?
Is it worth reading more?
Where can I read it from?
```

Externalization target:

```text
if current call has no sandbox:
  write to host thread outputs_path

if sandbox provider uses thread_data mounts:
  write to host outputs_path because sandbox sees the same virtual path

if sandbox exists but has no thread_data mounts:
  write directly into the sandbox filesystem with sandbox.write_file(...)
```

`thread_data mounts` means the provider exposes thread workspace/uploads/outputs
inside the sandbox via the same virtual `/mnt/user-data/...` paths. The code
checks the provider capability flag instead of guessing from provider name.

AIO Docker sandbox startup note:

```text
AIO Docker sandbox does not generate a per-sandbox compose file.
AioSandboxProvider uses LocalContainerBackend, which constructs a docker run
command at runtime from config + sandbox_id + port + mounts + image.
```

Project compose starts the DeerFlow services. The sandbox containers are created
dynamically by the provider when a sandbox is acquired.

Command support:

```text
tool result can be:
  ToolMessage

or:
  Command(update={"messages": [ToolMessage], ...})
```

The Command path matters because middleware such as `SandboxMiddleware` may need
to return both a tool result and a graph-state update, for example:

```python
Command(update={
    "messages": [tool_message],
    "sandbox": {"sandbox_id": "..."},
})
```

`ToolOutputBudgetMiddleware` patches ToolMessages inside `Command.update` as
well, so large outputs do not bypass the budget path.

When modifying a `Command`, it uses:

```python
dc_replace(result, update={**update, "messages": new_messages})
```

This creates a new Command instead of mutating the old one in place. The updated
Command is returned to LangGraph and becomes the state-commit input. The old
object remains useful as the original handler output for tracing/debugging.

Async path:

```text
_needs_budget:
  cheap pre-scan on the event loop

_patch_result:
  may write files or call sandbox I/O
  offloaded with asyncio.to_thread(...)
```

Boundary with summarization:

```text
ToolOutputBudgetMiddleware:
  single tool result boundary
  preserves full raw output externally when possible

SummarizationMiddleware:
  conversation history boundary
  replaces old messages with summary + preserved messages
```

### LLMErrorHandlingMiddleware

Responsibility:

```text
protect the model-call boundary from provider failures
```

Hook:

```text
wrap_model_call / awrap_model_call
```

This middleware is the model-side counterpart of `ToolErrorHandlingMiddleware`:

```text
LLMErrorHandlingMiddleware:
  wraps model provider calls

ToolErrorHandlingMiddleware:
  wraps tool function calls
```

Handler skeleton:

```text
handler-before logic:
  check the circuit breaker

handler call:
  call the real model provider through handler(request)

handler-after logic:
  on success, record provider recovery/success

handler exception logic:
  GraphBubbleUp -> re-raise
  normal exception -> classify, retry, fallback, or record circuit failure
```

Circuit breaker terminology uses electrical circuit semantics:

```text
closed:
  circuit is connected; model calls are allowed

open:
  circuit is disconnected; model calls fast-fail with fallback

half_open:
  recovery probe state; allow one model call to test if provider recovered
```

This is easy to misread because daily language suggests "closed" means blocked.
In circuit-breaker terminology, `closed` is the healthy pass-through state.

The circuit state is not passed in request. It is internal mutable state on the
middleware instance:

```text
_circuit_state
_circuit_failure_count
_circuit_open_until
_circuit_probe_in_flight
```

It is derived from prior model-call outcomes:

```text
successful model call:
  reset to closed
  clear failure count

retriable model failures:
  increment failure count
  trip to open when threshold is reached

open timeout elapsed:
  move to half_open
  allow one probe request

half_open probe success:
  close circuit

half_open probe failure:
  open circuit again
```

The lock around circuit checks protects shared middleware-instance state when
multiple runs use the same server concurrently.

Error classification returns:

```text
(retriable, reason)
```

Important categories:

```text
quota:
  account/billing/credit problem
  not retriable

auth:
  API key/permission/access problem
  not retriable

transient:
  timeout, connection error, 5xx, 429, stream timeout
  retriable

busy:
  provider overloaded / try again later
  retriable

generic:
  unclassified ordinary exception
  not retriable
```

Fallback behavior:

```text
provider exception
  -> middleware constructs AIMessage
  -> AIMessage.content is user-visible error text
  -> AIMessage.additional_kwargs stores structured error metadata
```

Example shape:

```python
AIMessage(
    content="LLM request failed: invalid model response format",
    additional_kwargs={
        "deerflow_error_fallback": True,
        "error_type": "ValueError",
        "error_reason": "generic",
        "error_detail": "invalid model response format",
    },
)
```

`GraphBubbleUp` is deliberately not converted to a fallback. It is a LangGraph
control-flow signal, not a provider failure.

Reliability policy:

```text
retriable failures:
  retry with backoff, then fallback if exhausted

quota/auth/generic:
  fallback without retry

continuous retriable failures:
  trip circuit breaker so later runs fast-fail temporarily

success:
  reset circuit breaker because provider health has been observed again
```

### MemoryMiddleware

Responsibility:

```text
enqueue conversation content for asynchronous memory update
```

Reads:

- user messages
- final assistant responses
- correction/reinforcement signals
- thread/user/agent identity

Writes:

- no `ThreadState` field directly

Side effect:

- calls global `MemoryUpdateQueue.add(...)`

The memory queue is a debounce queue, not a normal FIFO work queue. For the same `(thread_id, user_id, agent_name)` inside the debounce window, it keeps the latest conversation snapshot and merges boolean signals such as correction/reinforcement.

Memory queue mental model:

```text
MemoryMiddleware.after_agent()
  -> queue.add(...)
  -> lock
  -> merge same conversation target
  -> reset debounce timer
  -> timer fires later
  -> copy batch under lock
  -> call MemoryUpdater outside lock
```

There are two different locks:

```text
_queue_lock      protects singleton creation
self._lock       protects one MemoryUpdateQueue's internal queue/timer/processing state
```

The important engineering choice is that slow work such as model calls or storage writes happens outside the lock.

### TodoMiddleware

Responsibility:

```text
keep planning state visible and prevent premature final answers
```

It extends LangChain's `TodoListMiddleware`. The parent middleware provides the basic `write_todos` behavior and `todos` state updates. DeerFlow adds runtime protections around that state.

Reads:

- `state["todos"]`
- `state["messages"]`
- `runtime.context["thread_id"]`
- `runtime.context["run_id"]`

Writes:

- may append `todo_reminder` into `state["messages"]`
- may return `{"jump_to": "model"}` from `after_model`
- does not persist `todo_completion_reminder` into graph state; it injects it only into the next `ModelRequest`

Main hooks:

```text
before_model
  -> if todos exist but write_todos history disappeared from messages,
     append a hidden HumanMessage(name="todo_reminder")

after_model
  -> if the model produced a clean final answer while todos are incomplete,
     queue a completion reminder and jump back to the model node

wrap_model_call
  -> drain queued completion reminders and inject them into request.messages

before_agent / after_agent
  -> clear stale per-run reminder bookkeeping
```

Read this middleware by hook entrypoints first. The file has many helper functions, but most of them only serve these hooks:

```text
before_model
  -> context-loss repair

after_model
  -> premature-exit prevention

wrap_model_call
  -> request-only reminder injection

before_agent / after_agent
  -> cleanup for long-lived middleware instances
```

The `a*` hook names are async counterparts:

```text
before_model       -> sync path
abefore_model      -> async path
after_model        -> sync path
aafter_model       -> async path
wrap_model_call    -> sync path
awrap_model_call   -> async path
```

DeerFlow's Gateway uses async execution, but sync hooks are kept for embedded clients, tests, and LangChain compatibility.

Key distinction:

```text
ThreadState["todos"]
  durable structured planning state

messages containing write_todos(...)
  model-visible history of how the todo list was created/updated
```

Summarization can remove the `write_todos` history from messages while leaving `state["todos"]` intact. When that happens, the model can no longer see the active todo list, even though the runtime still has it.

`before_model()` repairs that mismatch:

```python
todos = state.get("todos") or []
if not todos:
    return None

messages = state.get("messages") or []
if _todos_in_messages(messages):
    return None

if _reminder_in_messages(messages):
    return None

return {"messages": [HumanMessage(name="todo_reminder", ...)]}
```

`_todos_in_messages()` checks whether any `AIMessage.tool_calls` still contains `write_todos`. If yes, the current model context already contains the todo list inside the tool call args, so no reminder is needed.

`todo_reminder` is not placed in the system prompt and is not prepended to the original user message. It is a new hidden `HumanMessage` appended to `state["messages"]`:

```python
HumanMessage(
    name="todo_reminder",
    additional_kwargs={"hide_from_ui": True},
    content="<system_reminder>...</system_reminder>",
)
```

The XML-like `<system_reminder>` tag is just text for the model. LangChain does not give it special semantics. DeerFlow uses the tag to make the message's intent clear to the model.

There are two different todo reminders:

```text
todo_reminder
  durable-ish message update returned by before_model
  repairs context loss after summarization

todo_completion_reminder
  transient request-only message injected by wrap_model_call
  prevents premature final answers while todos are incomplete
```

The second one is intentionally not persisted into `state["messages"]`, because it is a control prompt for the next model call, not part of the user-visible conversation.

Design lesson:

```text
TodoMiddleware projects durable planning state back into model-visible context,
and uses graph control flow to prevent incomplete plans from being silently abandoned.
```

Thread/run identity:

```text
thread_id
  long-lived conversation/session id

run_id
  one agent execution inside a thread
```

One `run_id` may contain multiple internal model/tool turns:

```text
model -> tool -> model -> tool -> model -> end
```

but it still belongs to one user-triggered agent execution. `run_id` is not the id of a single `AIMessage`.

The completion reminder queue is scoped by:

```python
(thread_id, run_id)
```

This prevents a transient reminder from one run leaking into another run on the same thread.

Internal bookkeeping:

```python
_pending_completion_reminders
  queued reminder text for the next model request

_completion_reminder_counts
  per-run retry cap, currently max 2 reminders

_completion_reminder_touch_order
  lightweight LRU order for pruning old keys
```

This state is protected by `threading.Lock` because the middleware instance can be long-lived and shared across concurrent runs.

Reading lesson:

```text
Do not follow helper functions first.
Find the hook, identify what it reads/writes, then inspect helpers only when they affect state, request, side effects, or graph control flow.
```

### ViewImageMiddleware

Responsibility:

```text
project viewed image runtime state into model-visible multimodal messages
```

It belongs to the same broad category as `TodoMiddleware`: both turn state that the runtime understands into messages the model can consume.

```text
TodoMiddleware
  state["todos"]
  -> hidden HumanMessage text reminder

ViewImageMiddleware
  state["viewed_images"]
  -> hidden HumanMessage with text + image_url content blocks
```

Main chain:

```text
model emits AIMessage(tool_calls=[view_image])
  -> tool runtime executes view_image_tool
  -> view_image_tool reads image bytes from filesystem
  -> returns Command(update={
       "viewed_images": {
         image_path: {"base64": "...", "mime_type": "image/png"}
       },
       "messages": [ToolMessage("Successfully read image")]
     })
  -> LangGraph applies the Command update to ThreadState
  -> next before_model
  -> ViewImageMiddleware reads state["viewed_images"]
  -> appends hidden HumanMessage(content=[text block, image_url block])
  -> next model call can inspect the image
```

`ToolMessage("Successfully read image")` is the tool-call result receipt. It tells the model that the requested tool call completed and preserves the `AIMessage(tool_calls)` -> `ToolMessage(tool_call_id=...)` protocol.

The image bytes themselves are not placed in that `ToolMessage`. They are stored in `ThreadState["viewed_images"]` first, then projected into the next model call by the middleware.

Hook entrypoints:

```text
before_model
  -> _inject_image_message

abefore_model
  -> async counterpart
```

Injection conditions:

```text
1. messages exist
2. the last AIMessage exists
3. that AIMessage contains a view_image tool call
4. all tool calls from that AIMessage have matching ToolMessages
5. image details have not already been injected after that AIMessage
```

The code anchors on the last `AIMessage`, not the last `HumanMessage`, because runtime-injected messages also use `HumanMessage`. In this middleware, the relevant boundary is the latest assistant tool-call turn:

```text
AIMessage(tool_calls=[view_image])
ToolMessage(...)
HumanMessage(image details)
```

So the check asks:

```text
Has image projection already happened after this tool-call turn?
```

not:

```text
Has there ever been a human message containing image details?
```

The content injected into the model is provider-compatible multimodal message content:

```python
[
    {"type": "text", "text": "Here are the images you've viewed:"},
    {"type": "text", "text": "\n- **/path/a.png** (image/png)"},
    {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,..."},
    },
]
```

`mime_type` identifies the data format, such as `image/png` or `image/jpeg`. It is used in the data URL:

```text
data:image/png;base64,...
```

This tells the provider how to parse the base64 payload.

Important caveat:

```text
provider-compatible does not mean universally standardized.
```

Different providers and LangChain adapters may support different multimodal block shapes. DeerFlow uses the common LangChain/OpenAI-style `image_url` block shape here, but portability still depends on the selected model/provider adapter.

Design strengths:

- separates image file IO from model-context projection
- keeps `ToolMessage` small and protocol-focused
- waits until all tool calls in the assistant turn complete before injecting images

Design risks:

- duplicate-injection detection relies on prompt text such as `"Here are the images you've viewed"`
- injected message lacks explicit `name` or structured source metadata
- historical `viewed_images` may remain in state and make future image projections larger
- provider-specific multimodal message schemas can drift

3.0 design direction:

```text
Use structured provenance and idempotency metadata for runtime-injected model-only messages.
Do not use prompt wording as runtime control metadata.
Separate provider role from DeerFlow author/source/visibility.
```

### DeferredToolFilterMiddleware

Responsibility:

```text
separate runtime-registered tools from model-visible tool schemas
```

It is the runtime enforcement layer for `tool_search` and deferred MCP tools.

Main idea:

```text
ToolNode may know all tools.
The model should only see active tools plus deferred tools that have been promoted.
```

This matters because MCP tools can be numerous and externally sourced. Exposing every schema to the model immediately would increase context size, confuse tool selection, and widen the tool surface.

Main chain:

```text
get_available_tools()
  -> returns built-ins + config tools + MCP tools + ACP tools

assemble_deferred_tools(filtered_tools, enabled=True)
  -> identifies deferred MCP tools
  -> builds DeferredToolCatalog
  -> creates tool_search
  -> returns final_tools and DeferredToolSetup

create_agent(tools=final_tools, middleware=[DeferredToolFilterMiddleware])
  -> ToolNode can execute all final_tools
  -> DeferredToolFilterMiddleware controls what schemas the model can see
```

Key fields:

```text
deferred_names
  full set of deferred tool names

promoted
  ThreadState field written by tool_search and read by this middleware

catalog_hash
  version fingerprint for the deferred tool catalog

hidden
  deferred_names - promoted_names
```

`promoted` is not a LangGraph built-in field. It is a DeerFlow field declared in `ThreadState`:

```python
promoted: Annotated[PromotedTools | None, merge_promoted]
```

The model does not directly read `state["promoted"]`. Instead:

```text
model calls tool_search
  -> tool_search writes Command(update={"promoted": ...})
  -> next model call
  -> DeferredToolFilterMiddleware reads state["promoted"]
  -> request.tools is filtered differently
  -> model sees newly promoted tool schemas
```

So:

```text
promoted = runtime/middleware visibility state
request.tools = model-visible tool menu
```

`catalog_hash` prevents stale persisted promotion state from exposing drifted tools. A promotion is valid only when:

```python
promoted.get("catalog_hash") == self._catalog_hash
```

If the MCP tool catalog changes, old promoted names are ignored.

Hook entrypoints:

```text
wrap_model_call
  -> filter request.tools before model binding

wrap_tool_call
  -> block execution if an unpromoted deferred tool is somehow called
```

`wrap_model_call()` path:

```python
def _filter_tools(self, request: ModelRequest) -> ModelRequest:
    if not self._deferred:
        return request

    hide = self._hidden(request.state)
    if not hide:
        return request

    active = [
        t for t in request.tools
        if getattr(t, "name", None) not in hide
    ]

    return request.override(tools=active)
```

This only changes the current model request. It does not remove tools from ToolNode.

`wrap_tool_call()` path:

```python
def wrap_tool_call(self, request, handler):
    blocked = self._blocked_tool_message(request)
    if blocked is not None:
        return blocked
    return handler(request)
```

This is execution-side enforcement. Hiding a schema from the model is not enough because the model may still attempt to call a hidden tool from memory, prompt hints, stale state, or provider quirks.

The blocking rule is:

```text
if tool name is in hidden deferred tools:
  return ToolMessage(status="error")
else:
  call the real tool handler
```

The middleware returns an error `ToolMessage` instead of raising:

```python
ToolMessage(
    content="Error: Tool ... is deferred and has not been promoted yet...",
    tool_call_id=tool_call_id,
    name=name,
    status="error",
)
```

This preserves the tool-call protocol:

```text
AIMessage(tool_calls=[call_xxx])
  -> ToolMessage(tool_call_id=call_xxx, status="error")
```

The next model turn can read the error and recover by calling `tool_search` first.

Design lesson:

```text
DeferredToolFilterMiddleware is fail-closed:
presentation is filtered at model binding time,
execution is blocked at tool-call time.
```

Design lesson:

```text
Runtime tool registration and model-visible tool schema exposure are separate concerns.
```

Complete visibility loop:

```text
assemble_deferred_tools(...)
  -> deferred_names + catalog_hash + tool_search

create_agent(...)
  -> ToolNode receives final_tools, including deferred tools
  -> DeferredToolFilterMiddleware receives deferred_names + catalog_hash

first model call
  -> middleware hides unpromoted schemas from request.tools

model calls tool_search
  -> tool_search returns ToolMessage
  -> tool_search also writes Command(update={"promoted": ...})

next model call
  -> middleware reads state["promoted"]
  -> promoted tool schemas are now visible in request.tools

promoted tool call
  -> wrap_tool_call allows handler(request)
  -> ToolNode executes the actual tool
```

`tool runtime` here means the ToolNode/tool execution layer, not another middleware:

```text
AIMessage(tool_calls=[...])
  -> ToolNode / tool execution layer
  -> wrap_tool_call middleware chain
  -> real tool handler
  -> BaseTool.invoke / ainvoke
  -> ToolMessage or Command
  -> LangGraph merges result into state
```

Middleware wraps this execution path. It can allow the call by invoking `handler(request)`, or short-circuit it by returning a `ToolMessage`/`Command`.

Design strengths:

- deferred schemas reduce context pressure
- promoted visibility persists across turns through `ThreadState["promoted"]`
- `catalog_hash` avoids stale promotion after tool catalog drift
- model-binding enforcement and execution enforcement are both present

Design risks:

- runtime policy state lives inside `ThreadState`, which can blur model state and runtime state
- denial is returned as natural-language `ToolMessage` text rather than a structured policy-denial object
- prompt may still list deferred tool names, so the model can guess tool calls
- if the catalog hash changes, previously promoted tools disappear without an explicit user-facing explanation

### SubagentLimitMiddleware

Responsibility:

```text
truncate excessive `task` tool calls before they start subagents
```

It is an `after_model` middleware:

```text
model outputs AIMessage(tool_calls=[...])
  -> SubagentLimitMiddleware.after_model
  -> truncate excess task calls
  -> tools node executes only the remaining task calls
```

It runs after the model because that is the first point where the generated `tool_calls` are available, and before the tools node executes them.

The middleware only checks:

```python
last_msg = messages[-1]
```

because at `after_model` time, the newly generated `AIMessage` is expected to be the last message. Historical `task` calls should not be rewritten because they may already have corresponding `ToolMessage` results.

Main logic:

```python
task_indices = [
    i for i, tc in enumerate(tool_calls)
    if tc.get("name") == "task"
]

if len(task_indices) <= self.max_concurrent:
    return None

indices_to_drop = set(task_indices[self.max_concurrent:])
truncated_tool_calls = [
    tc for i, tc in enumerate(tool_calls)
    if i not in indices_to_drop
]

updated_msg = clone_ai_message_with_tool_calls(last_msg, truncated_tool_calls)
return {"messages": [updated_msg]}
```

`clone_ai_message_with_tool_calls()` preserves the original message id while replacing the `tool_calls` list. This matters because LangGraph's message reducer can replace an existing message when the incoming message has the same id.

Mental model:

```text
old AIMessage(id="msg_123", tool_calls=[task1, task2, task3, task4])
new AIMessage(id="msg_123", tool_calls=[task1, task2, task3])

same id -> replace old message
different id -> append another message
```

The intent is to correct the model's freshly emitted AIMessage, not to add a second AIMessage.

Configuration:

```python
MIN_SUBAGENT_LIMIT = 2
MAX_SUBAGENT_LIMIT = 4
```

This clamps the configured maximum concurrent subagent calls into `[2, 4]`.

Important nuance:

```text
MIN_SUBAGENT_LIMIT = 2 does not mean the model must start at least 2 subagents.
It means the configured maximum is not allowed below 2.
```

If the model emits one `task` call, it still runs normally.

Design strength:

```text
subagent fan-out is enforced by runtime, not only by prompt instruction
```

Design risk:

```text
once subagents are enabled, the hard-coded minimum of 2 makes "single-subagent concurrency" impossible through max_concurrent_subagents
```

Project-level nuance:

```text
subagent_enabled=False
  -> task_tool is not added
  -> SubagentLimitMiddleware is not added
  -> subagents are disabled

subagent_enabled=True
  -> task_tool is added
  -> SubagentLimitMiddleware is added
  -> max_concurrent_subagents is clamped to [2, 4]
```

So the risk is not that 2.x cannot disable subagents. It can. The narrower risk is that, once enabled, the concurrency policy cannot express a maximum of 1.

Even then, this does not mean the model cannot run a single subagent. It can. The limitation is only at configuration semantics:

```text
actual model output: one task call
  -> allowed

configured max_concurrent_subagents=1
  -> clamped to 2
  -> cannot express "enabled, but at most one concurrent task"
```

### LoopDetectionMiddleware

Responsibility:

```text
detect repetitive tool-call loops and stop the agent before recursion limits or runaway cost
```

It is another `after_model` middleware, but more stateful than `SubagentLimitMiddleware`.

Main hook flow:

```text
after_model
  -> _apply
  -> _track_and_check
  -> warning: queue pending warning
  -> hard stop: rewrite last AIMessage and clear tool_calls

wrap_model_call
  -> drain pending warnings
  -> append HumanMessage(name="loop_warning") to request.messages

before_agent / after_agent
  -> clear stale pending warnings for run isolation
```

Why warnings are not injected directly in `after_model`:

```text
after_model fires immediately after AIMessage(tool_calls=[...])
ToolMessage results do not exist yet
```

If a warning were appended immediately, the history would become invalid:

```text
AIMessage(tool_calls=[call_1])
HumanMessage(loop warning)
ToolMessage(tool_call_id=call_1)
```

Many providers require tool results to follow the assistant tool-call message without unrelated messages in between. So warnings are queued and injected at the next `wrap_model_call`, after the tool results have been added:

```text
AIMessage(tool_calls=[call_1])
ToolMessage(tool_call_id=call_1)
HumanMessage(loop_warning)
```

Detection layer 1: hash-based repetition.

Each model output's `tool_calls` are normalized into a stable hash:

```text
tool name + stable parameter key
```

For `read_file`, the stable key uses:

```text
path + line-range bucket
```

because slightly different line ranges can still represent repeated reading of the same file region:

```text
read_file(a.py, 1-100)   -> a.py:0-0
read_file(a.py, 5-120)   -> a.py:0-0
read_file(a.py, 30-160)  -> a.py:0-0
```

For content-sensitive tools such as `write_file` and `str_replace`, the full args are used to reduce false positives.

The normalized tool-call strings are sorted before hashing so the same set of calls produces the same hash even if tool-call order changes.

Thresholds:

```text
same hash appears >= warn_threshold
  -> queue warning

same hash appears >= hard_limit
  -> hard stop
```

Detection layer 2: per-tool frequency.

Hash-based detection catches "same action repeated." Frequency detection catches "same type of action too many times with different args":

```text
read_file(a.py)
read_file(b.py)
read_file(c.py)
...
```

It tracks counts by tool name:

```text
read_file -> 30 calls -> warning
read_file -> 50 calls -> hard stop
```

Tool-specific overrides can raise or lower thresholds for tools that are naturally high-frequency.

Soft brake:

```text
warning detected
  -> queue pending warning under (thread_id, run_id)
  -> return None
  -> tools still run
  -> next wrap_model_call injects warning into request.messages
```

Hard brake:

```text
hard limit reached
  -> rewrite current AIMessage
  -> append forced-stop text
  -> clear structured tool_calls
  -> clear raw additional_kwargs tool-call payloads
  -> change finish_reason from tool_calls to stop when needed
```

After hard stop, the message becomes ordinary assistant text:

```text
AIMessage(tool_calls=[], content="[FORCED STOP] ...")
```

so the graph does not route into the tools node.

Design strengths:

- catches both repeated identical actions and excessive same-tool exploration
- preserves provider tool-call pairing by delaying warnings
- hard stop changes graph behavior structurally by removing tool calls
- internal state is bounded through window size, max tracked threads, and pending-warning caps

Design risks:

- heuristics may false-positive on legitimate broad exploration
- thresholds need per-tool tuning
- warnings are plain text rather than structured runtime events
- internal middleware state is in memory, so cross-process behavior depends on run placement

Design lesson:

```text
LoopDetectionMiddleware distinguishes advisory control from structural intervention.
Warnings are request-only soft brakes.
Hard stops rewrite the current AIMessage so tool execution cannot continue.
```

### ClarificationMiddleware

Responsibility:

```text
turn an `ask_clarification` tool call into a user-facing clarification interrupt
```

The tool itself is intentionally thin:

```python
@tool("ask_clarification", parse_docstring=True, return_direct=True)
def ask_clarification_tool(...):
    return "Clarification request processed by middleware"
```

The important behavior is not the function body. The tool mainly exposes a schema to
the model. The runtime behavior is implemented by `ClarificationMiddleware`.

The middleware hook is tool-call scoped:

```python
def wrap_tool_call(self, request, handler):
    if request.tool_call.get("name") != "ask_clarification":
        return handler(request)

    return self._handle_clarification(request)
```

For an `ask_clarification` call, it builds a `ToolMessage`:

```python
ToolMessage(
    id=self._stable_message_id(tool_call_id, formatted_message),
    content=formatted_message,
    tool_call_id=tool_call_id,
    name="ask_clarification",
)
```

and returns:

```python
Command(
    update={"messages": [tool_message]},
    goto=END,
)
```

The frontend/channel layer can then recognize:

```text
message.type == "tool"
message.name == "ask_clarification"
```

and render it as a clarification UI instead of as an ordinary tool result.

Normal path:

```text
model emits AIMessage(tool_calls=[ask_clarification])
  -> ToolNode executes that tool call
  -> ClarificationMiddleware intercepts it
  -> returns ToolMessage + Command(goto=END)
  -> create_agent sees all client-side tools are return_direct
  -> graph routes to END
  -> run waits for the user's answer
```

This is the path the prompt is trying to force:

```text
Clarify -> Plan -> Act
```

`ask_clarification` should happen first, by itself, before the agent starts work.

Important edge case:

```text
AIMessage(tool_calls=[A, ask_clarification, C])
```

This is not the intended model behavior, but it is a useful runtime boundary test.

In the installed LangGraph/LangChain versions used by this workspace:

```text
ToolNode executes multiple tool calls for the same AIMessage together.
async ToolNode uses asyncio.gather(*coros).
```

So `Command(goto=END)` returned by the clarification tool call is not a synchronous
"kill the whole ToolNode right now" signal. Other tool calls from the same assistant
message may already be executing or may complete before the ToolNode combines outputs.

After tool execution, LangChain's `create_agent` tools-to-model edge applies another
rule:

```text
if all executed client-side tools have return_direct=True:
  route to END
else:
  route back to model
```

Therefore:

```text
only ask_clarification
  -> all client-side tools are return_direct
  -> ends the run

ask_clarification mixed with a normal tool
  -> not all client-side tools are return_direct
  -> the graph may route back to model
```

This corrects an easy but wrong mental model:

```text
Command(goto=END) from one tool call does not necessarily cancel sibling tool calls
from the same AIMessage.
```

Another important nuance:

```text
ask_clarification question/context/options are generated before any same-turn tools run.
```

So if the model emits `[A, ask_clarification, C]`, the clarification question cannot be
based on the return values of `A` or `C` from that same turn. Those results can only
influence a later model call if the graph routes back to the model.

Design strengths:

- clarification is represented as a tool schema, so the model can choose it through the
  same interface as other actions
- user-facing formatting is centralized in middleware, not in the placeholder tool body
- stable clarification message ids let retried clarification calls replace instead of
  blindly append
- `return_direct=True` plus `Command(goto=END)` makes the normal single-tool path
  simple and legible

Design risks:

- exclusivity is prompt-enforced, not graph-enforced
- `wrap_tool_call` sees one tool call at a time, so it cannot arbitrate the whole
  `AIMessage.tool_calls` list
- mixed tool calls can run ordinary tools before the clarification is answered
- comments and prompt text may overstate "execution stops automatically" unless they
  explicitly scope that claim to the single-clarification path

Design lesson:

```text
Prompt policy is not the same as runtime policy.
If clarification must be exclusive, enforce that before ToolNode executes sibling tools.
```

## State and Config

Reads:

- `ThreadState.messages`
- `ThreadState.thread_data`
- `ThreadState.sandbox`
- `ThreadState.title`
- upload metadata inside message `additional_kwargs`
- memory config
- runtime config such as thread/user identity

Writes:

- `thread_data`
- `sandbox`
- `uploaded_files`
- `messages`
- `title`
- later middleware also writes `viewed_images`, `promoted`, and may return `Command` updates

External side effects:

- file-system inspection for uploads
- sandbox acquisition
- model calls for title/memory/summarization
- memory queue background timer
- logs and audit events

## Design Strengths

Middleware keeps cross-cutting behavior out of the core agent graph.

The graph can stay conceptually simple:

```text
model node -> tools node -> model node -> ...
```

while DeerFlow still adds:

- runtime context injection
- upload handling
- sandbox binding
- error normalization
- UI metadata
- memory side effects
- deferred tool enforcement
- clarification interrupt behavior

This is a good engineering pattern for large agent systems because many behaviors are not part of the agent's reasoning loop, but must reliably happen around it.

## Design Risks

The main risk is hidden ordering dependency.

For example:

- upload patching must happen before the model sees messages
- sandbox must exist before sandbox tools execute
- dangling tool-call repair must happen before provider validation
- clarification middleware must sit near the end so it can intercept the special tool behavior
- memory must run after the assistant response exists

Another risk is semantic overload:

```text
middleware may patch messages
middleware may write ThreadState
middleware may call external services
middleware may schedule background work
middleware may control graph flow
```

This is powerful, but new contributors can struggle to tell whether a middleware is pure transformation, state mutation, side effect, or control-flow logic.

## Current 2.x Smells

Several pieces are reasonable individually but hard to read together:

- dynamic context is represented as hidden `HumanMessage`
- upload files are attached through message `additional_kwargs`
- memory update is a background side effect rather than a visible graph node
- error handling is split across LLM errors, tool errors, dangling tool-call repair, guardrails, and safety finish reason
- `ThreadState` contains both domain state and UI/runtime helper state

These choices are pragmatic, but they raise the learning cost.

## Code Reading Focus

Core files:

- `backend/packages/harness/deerflow/agents/thread_state.py`
- `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- `backend/packages/harness/deerflow/agents/middlewares/thread_data_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/uploads_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/sandbox/middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/dangling_tool_call_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/tool_error_handling_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/dynamic_context_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/title_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- `backend/packages/harness/deerflow/agents/memory/queue.py`
- `backend/packages/harness/deerflow/agents/middlewares/todo_middleware.py`
- `backend/packages/harness/deerflow/agents/middlewares/view_image_middleware.py`
- `backend/packages/harness/deerflow/tools/builtins/view_image_tool.py`

## Forgetting Recovery Map

If the details fade, recover the model in this order:

```text
ThreadState
  -> what durable fields can middleware read/write?

Middleware order
  -> what must happen before model/tool execution?

Handler
  -> middleware calls handler(request) to pass control to next layer

Command(update=...)
  -> tool or middleware can request state updates; reducers decide merge behavior

Side effects
  -> memory/sandbox/files/model calls may happen outside state updates
```
