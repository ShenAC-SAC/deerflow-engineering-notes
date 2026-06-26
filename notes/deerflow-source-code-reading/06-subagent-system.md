# Subagent System

## One-line Mental Model

Subagent 可以理解为「用同一个 `create_agent` 工厂造出来的、更窄、更短命的 agent」。它继承父 agent 的工作现场（sandbox / thread_data / thread_id），去掉递归委派、持久 checkpoint、共享内部对话历史等能力，在后台独立运行，最后只把提炼后的文本结论递回 lead。

```text
subagent = 同一工厂 + 同一种 graph + 同一个 agent loop
         + 更窄的零件（工具子集、无 task、checkpointer=False）
         + 后台独立执行
         + 只回传一段最终文本
```

## System Position

三层结构，`create_agent` 在这条链里被调用**两次**（造 lead 一次、造 subagent 一次）。中间夹着的 `task_tool` **本身只是一个工具函数，不是 agent**。

```text
① lead agent              <- create_agent（第一次）
     model 决定调用 task
     │
② after_model hook
     SubagentLimitMiddleware 把多余的 task 调用裁到 <= MAX_CONCURRENT_SUBAGENTS(3)
     （只决定"准派几个"，不创建 subagent）
     │
③ tools node 执行工具
     task_tool 在 wrap_tool_call 调用链的最内层被调用
     │  task_tool 负责建 executor、放到后台、轮询状态、把结果包成字符串返回
     ▼
④ task_tool 函数体内
     SubagentExecutor.execute_async -> _aexecute -> _create_agent -> create_agent（第二次）
     ▼
⑤ subagent                <- 后台独立 loop 上运行 agent.astream 的完整 agent
```

关键纠偏：

- 「造 subagent」**不在任何 before/after_model hook 里**，而是在 **tools node 执行 task_tool 这个函数**时发生，位于 `wrap_tool_call` 中间件链的最中心。
- hook 只负责「准不准派、派几个」；创建发生在工具节点执行工具函数时，对 middleware 来说是不透明的工具内部逻辑。

Upstream:

- `lead_agent`（其 tools node 绑定了 `task` 工具）
- `SubagentLimitMiddleware`（after_model 裁剪）
- LangGraph ToolNode（注入 runtime、wrap_tool_call）

Downstream:

- `task_tool`（`tools/builtins/task_tool.py`）
- `SubagentExecutor`（`subagents/executor.py`）
- `get_subagent_config` / `BUILTIN_SUBAGENTS` / config.yaml custom_agents（`subagents/registry.py`）
- `create_agent` 造出的 subagent graph

## Inherit vs Sever

subagent 设计的全部张力：**继承足够多的父级工作现场，同时切断会扩大权限或生命周期的能力**。

```text
传下去（站同一个工作现场）        切断掉（保持有界 / 安全）
──────────────────────────       ──────────────────────────
sandbox      同一执行环境         无 task 工具    subagent_enabled=False -> 不能继续委派
thread_data  同一批文件上下文     checkpointer    =False -> 一次性、不存档、不 resume
thread_id    同一会话身份         独立 state      每个 task 全新 state -> 并行不串味
```

- 继承在 `task_tool.py` 里手动从 `runtime.state` 掏出 `sandbox` / `thread_data` / `thread_id`，再由 executor 塞进 subagent 的初始 `state`。
- `subagent_enabled=False` 写死在 task_tool 给 subagent 装工具的那一步，阻断递归委派。
- `checkpointer=False` 写死在 `_create_agent` 里：subagent 是「派出去办一件事」的一次性执行单元，不需要存档。

## Why ThreadState（为什么复用 state schema）

subagent 的 `state_schema=ThreadState`，跟 lead 同款。原因是 subagent 本身也是完整 agent，需要在自己的工具调用里读取同一组状态字段：

```text
subagent 自己也是完整 agent，内部要跑 bash / read_file / write_file，
这些工具要读 state["sandbox"]、state["thread_data"]，
所以 state schema 必须声明这些字段 -> 复用 ThreadState。
```

schema 是「插槽」，继承是「往插槽里塞东西」。正因为有 `sandbox` 字段，父级的 `sandbox_state` 才塞得进去。

## Tools: Three-Layer Funnel

工具从「父亲的全套」出发，过三道滤网，**每层只做减法、绝不放宽**（fail-safe）。

```text
父亲的工具范围
   ▼ 漏斗①：继承父 tool_groups（task_tool 把 parent_tool_groups 传给 get_available_tools；同时 subagent_enabled=False 摘掉 task）
全套候选（已受父亲组限制，权限天花板不超过父亲）
   ▼ 漏斗②：subagent 自己的 allow/deny（_filter_tools(config.tools, config.disallowed_tools)）
该 subagent 工种允许的工具
   ▼ 漏斗③：skill 的 allowed-tools（filter_tools_by_skill_allowed_tools）
最终孩子能用的工具
   ▼ 之后才追加 deferred 的 tool_search（assemble_deferred_tools）
```

deferred `tool_search` **故意排在三层漏斗之后**，所以它永远不会反过来暴露被漏斗筛掉的工具。MCP 工具的完整 schema 先藏着，等模型用 `tool_search` 再 promote —— 与 lead agent 同一套成本逻辑。

## Skills

分两步：先决定「准用哪些」（政策），再「注入内容」（加载）。

政策层（`task_tool._merge_skill_allowlists`）：跟父亲取交集，孩子不能越权。

```text
父亲没限制(parent=None)  -> 用孩子自己的 config.skills
孩子没指定(child=None)   -> 继承父亲整个 allowlist
两边都有                 -> 交集：孩子想要的 ∩ 父亲准许的
```

加载层（`executor._load_skills`），`config.skills` 三态语义要分清：

```text
config.skills = None       -> 加载所有启用的 skill
config.skills = []         -> 一个都不加载（注意：空列表 = 明确不要，不是"全给"）
config.skills = ["a","b"]  -> 只加载这两个（前提它们也启用了）
```

注入层（`executor._load_skill_messages` + `_build_initial_state`）：skill 内容**不拼进 `config.system_prompt` 字符串**，而是在组装最终那条 SystemMessage 时被当作一段内容拼进去。

```text
_load_skill_messages：每个 skill 先各自包成临时 SystemMessage(<skill name=...>...</skill>)
                      —— 中间产物，不直接进对话
_build_initial_state：把它们的 .content 抠出来，和 config.system_prompt、deferred 说明
                      一起 "\n\n".join 成【最终一条 SystemMessage】
```

为什么合并成一条：某些 LLM API 拒绝多条 SystemMessage（"System message must be at the beginning"）。

## Initial Messages（最终送进模型的形态）

```text
state["messages"] = [
    SystemMessage(  # 只有一条
        config.system_prompt
        + "\n\n" + 各 skill 正文
        + "\n\n" + deferred 工具点名说明
    ),
    HumanMessage(task),   # 任务本身
]
```

注意区分两类「工具信息」：

```text
工具的 schema/定义    -> 绑在模型上（create_agent 的 tools 参数），不在 messages 里
deferred 工具的点名    -> 一段纯提示文字，拼进那条 SystemMessage（只报名字、不含调用细节）
```

`create_agent(system_prompt=None)` 是故意的：系统提示改以 SystemMessage 形式进初始 messages，避免出现多条 SystemMessage。

## Where `config` Comes From

`self.config`（SubagentConfig）由 `get_subagent_config(subagent_type)` 解析，两个来源：

```text
内置（general-purpose / bash）
  整个来自 BUILTIN_SUBAGENTS（Python 写死在 subagents/builtins/）
  system_prompt 是源码里的字符串字面量

自定义
  来自 config.yaml 的 subagents.custom_agents，system_prompt 从配置读

叠加：config.yaml subagents.agents 段的 per-agent 覆盖
  只动 timeout_seconds / max_turns / model / skills
  碰不到 system_prompt
```

硬结论：**内置 subagent 的 system_prompt 纯写死，不从配置读、也无法被配置覆盖。** 要改它只能改源码，或在 custom_agents 里另定义一个类型。

当前代码里，`general-purpose` 内置默认 `max_turns=150`，`bash` 内置 agent 也有自己的上限；全局 `subagents.max_turns` 才会覆盖这些内置值。`SubagentConfig.timeout_seconds=900` 是兜底值，内置 agent 的有效超时通常由全局 `subagents.timeout_seconds`（默认 1800 秒）叠加出来。

## Execution Model（实现细节，理解设计不必深究）

「后台独立运行」的底层落地，是这套设计里最绕、但**对理解 subagent 业务不必要**的部分。一句话框架：

```text
task_tool 协程（留在主 loop，每 5s await sleep 轮询，不阻塞主 agent）
  -> execute_async：_scheduler_pool(max_workers=3) 借一个调度线程，立即返回 task_id
       -> run_coroutine_threadsafe 把子 agent 协程丢到 _isolated_subagent_loop
          （一条全进程常驻、跨任务复用的 event loop，跑在自己的 daemon 线程里）
```

三个执行身份里只有两个是真线程（调度线程 + 常驻 loop 线程）；task_tool 是主 loop 上的协程，不是新线程。共享黑板是全局 `_background_tasks[task_id] -> SubagentResult`：后台写状态，前台读。

为什么不用「每个 subagent 新建一条 loop」：避免每次执行新建/关闭 loop 时把共享 async 客户端（httpx 等）连带销毁，所以复用一条常驻 loop。

取消 / 超时（协作式，不强杀线程，因为 Python 杀不掉线程）：

```text
cancel：request_cancel_background_task 只"举旗"（threading.Event.set()）
        _aexecute 在 agent.astream 每个迭代边界 is_set() 查岗，看见就自己 return CANCELLED
        代价：取消有延迟，长 tool call 要等它跑到下一个 chunk 才停
timeout：调度线程 future.result(timeout=...) 超时 -> 举旗 + 标 TIMED_OUT
状态竞态：try_set_terminal 用锁保证"终态只能盖一次章"，第一个写终态的赢
```

结果回流（与 subagent 的 state 无关，另一条独立路径）：

```text
subagent 跑完 -> 抠出最后一条 AIMessage 的文本 -> result.result（字符串）
task_tool 返回普通 str（"Task Succeeded. Result: ..."）
ToolNode 自动把 str 包成 ToolMessage（配原 tool_call_id），塞回 lead 对话
=> subagent 内部几十条 message 全扔掉，lead 只收到一段提炼好的文本
```

## Key Takeaways

- subagent 是 `create_agent` 造的完整 graph，有自己的 agent loop；它和 lead 用同一个工厂、同一种结构，只是零件更窄、更短命。
- `task_tool` 是工具函数，不是 agent；造 subagent 发生在 tools node 跑 task_tool 时，不在任何 model hook 里。
- 继承（sandbox/thread_data/thread_id）让 subagent 站在父亲的工作现场；切断（无 task / checkpointer=False / 独立 state）保证有界安全。
- state 复用 ThreadState 是为 subagent 自己跑工具，不是为了回传结果。
- 工具三层漏斗、skill 政策取交集，都只做减法、不越权（fail-safe）。
- 最终消息 = 一条 SystemMessage（system_prompt + skills + deferred 点名拼接）+ 一条 HumanMessage；工具 schema 绑在模型上，不在消息里。
- 内置 subagent 的 system_prompt 写死，不可配置覆盖；自定义类型才从 config.yaml 读。
- `general-purpose` 在当前代码里的内置默认 `max_turns=150`；全局 `subagents.max_turns` 才会覆盖它。
- 结果靠「task_tool 返字符串 + ToolNode 现包 ToolMessage」回流，subagent 自己的 state 不参与；这正是 "preserve context by keeping exploration separate"。
- 后台执行 / 隔离 loop / 线程 / cancel_event 是后台运行的实现细节，属于异步运行时层面，理解 subagent 设计不必深究。

## Code Reading Focus

Core files:

```text
backend/packages/harness/deerflow/tools/builtins/task_tool.py
backend/packages/harness/deerflow/subagents/executor.py
backend/packages/harness/deerflow/subagents/registry.py
backend/packages/harness/deerflow/subagents/config.py
backend/packages/harness/deerflow/subagents/builtins/general_purpose.py
backend/packages/harness/deerflow/subagents/builtins/bash_agent.py
backend/packages/harness/deerflow/agents/middlewares/subagent_limit_middleware.py
backend/packages/harness/deerflow/skills/tool_policy.py
```

Functions worth reading:

```text
task_tool()                          # 建 executor、轮询、包装结果
_merge_skill_allowlists()            # skill 政策取交集
SubagentExecutor.__init__()          # 工具三层漏斗起点（_filter_tools）
SubagentExecutor._build_initial_state()  # skill 注入 + 合并 SystemMessage + deferred
SubagentExecutor._create_agent()     # create_agent(checkpointer=False, state_schema=ThreadState)
SubagentExecutor._aexecute()         # astream + cancel 查岗 + 抠最终文本
SubagentExecutor.execute_async()     # 扔后台调度线程 + 隔离 loop + 超时
get_subagent_config()                # 内置 vs custom_agents + per-agent override
SubagentResult.try_set_terminal()    # 终态只盖一次章（竞态）
```
