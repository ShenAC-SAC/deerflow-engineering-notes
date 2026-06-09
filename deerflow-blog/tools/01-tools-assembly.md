# DeerFlow tools 模块：从工具列表到运行期能力

很多人第一次读 Agent 框架的 tools 模块，会下意识把它理解成“这里注册了一堆函数”。这个理解只对了一小半。

在 DeerFlow 2.x 里，tools 模块真正负责的是为一次 agent run 生成一份“运行期能力快照”：哪些工具来自配置，哪些工具来自内置能力，哪些工具要因为模型、沙箱、skill、MCP 或子 Agent 策略被加入、移除或延迟暴露。最后，这份工具列表才会被交给 LangChain 的 `create_agent(..., tools=...)`。

一句话心智模型：

```text
DeerFlow 的工具系统不是静态注册表，而是 run-scoped capability assembly。
```

本文基于当前 2.x 源码和现有 tutorials 笔记整理。3.0 方向的设计观察会放在独立小节里，不和源码事实混写。

## 先看全景

核心源码锚点：

- `backend/packages/harness/deerflow/tools/tools.py`
- `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- `backend/packages/harness/deerflow/tools/builtins/tool_search.py`
- `backend/packages/harness/deerflow/agents/thread_state.py`
- `backend/packages/harness/deerflow/skills/tool_policy.py`

最重要的分层是三层：

```text
工具来源层
  config.yaml / built-ins / MCP / ACP / subagent / skill_manage

可见性策略层
  tool_groups / host bash safety / model capability / skill allowed_tools / deferred tool_search

运行期执行层
  LangChain ToolNode / DeerFlow middleware / LangGraph Command / ThreadState
```

如果只看 `list[BaseTool]`，这些层会混在一起。读源码时要不断问自己：现在这段代码是在“发现工具”、在“决定能不能给这次 run 用”，还是在“处理工具执行后的状态和控制流”？

## 调用链：工具列表怎么进入 Agent

主线入口在 `_make_lead_agent()`。

简化后的调用链是：

```text
_make_lead_agent(config)
  -> 解析 runtime config: model_name, thinking_enabled, subagent_enabled, agent_name
  -> load_agent_config(agent_name)
  -> _load_enabled_skills_for_tool_policy(...)
  -> get_available_tools(...)
  -> filter_tools_by_skill_allowed_tools(...)
  -> assemble_deferred_tools(...)
  -> build_middlewares(..., deferred_setup=setup)
  -> apply_prompt_template(..., deferred_names=setup.deferred_names)
  -> create_agent(model=..., tools=final_tools, middleware=..., state_schema=ThreadState)
```

这里有两个容易漏掉的点。

第一，`get_available_tools()` 产出的还不是最终工具列表。它只回答：

```text
按系统配置、内置能力和 runtime switch，这个 agent 候选对象能拿到哪些工具？
```

之后还要经过 skill 级别的 `allowed_tools` 过滤，以及 MCP deferred tool 的装配。

第二，`deferred_setup` 同时传给三个地方：

- `create_agent(tools=final_tools)`：ToolNode 仍然持有可执行工具。
- `build_middlewares(..., deferred_setup=setup)`：middleware 决定哪些 schema 暂时不暴露给模型，以及哪些未 promote 的调用要被拦截。
- `apply_prompt_template(..., deferred_names=...)`：system prompt 只列出 deferred tool 名字，告诉模型可以先用 `tool_search` 找 schema。

所以 deferred tools 不是一个局部技巧，而是跨越 tool assembly、prompt、middleware、`ThreadState` 的一条完整链路。

同一套思路也出现在 `DeerFlowClient` 和 subagent executor 中。`backend/packages/harness/deerflow/client.py` 会在创建 embedded agent 时调用 `assemble_deferred_tools()`；`backend/packages/harness/deerflow/subagents/executor.py` 会在 subagent 初始状态构造时同样应用 skill policy 和 deferred tool setup。

## `get_available_tools()` 做了什么

`backend/packages/harness/deerflow/tools/tools.py` 是本章的主文件。它的工作可以按顺序拆成十步：

```text
1. 读取 AppConfig.tools。
2. 如果 custom agent 配了 tool_groups，只保留对应 group 的工具。
3. 如果当前沙箱/安全配置不允许 host bash，移除 bash 执行面。
4. 用 resolve_variable(cfg.use, BaseTool) 动态导入工具对象。
5. 检查 config name 和 tool.name 是否不一致，不一致则记录 warning。
6. 给 async-only tool 补 sync wrapper，兼容 sync agent caller。
7. 加入 DeerFlow built-in tools。
8. 根据 runtime switch 加 task_tool，根据模型能力加 view_image_tool。
9. 加载并标记 MCP tools；如果有 ACP agents，则构造 invoke_acp_agent 工具。
10. 按 tool.name 去重，保留先出现的工具。
```

这里最值得记住的是顺序。去重优先级是：

```text
config-loaded tools
-> built-ins
-> MCP tools
-> ACP tools
```

如果两个工具最终的 `tool.name` 相同，先出现的赢，后出现的会被跳过并记录 warning。DeerFlow 的工具路由是按 `tool.name` 走的，因此真正暴露给模型和 runtime router 的名字是工具对象自己的 `.name`，不一定等于 `config.yaml` 里的 `tools[*].name`。

## 配置不是工具本身

`config.example.yaml` 里的工具配置大概长这样：

```yaml
tool_groups:
  - name: web
  - name: file:read
  - name: file:write
  - name: bash

tools:
  - name: web_search
    group: web
    use: deerflow.community.ddg_search.tools:web_search_tool

  - name: read_file
    group: file:read
    use: deerflow.sandbox.tools:read_file_tool

  - name: write_file
    group: file:write
    use: deerflow.sandbox.tools:write_file_tool

  - name: bash
    group: bash
    use: deerflow.sandbox.tools:bash_tool
```

`use` 不是 Python import 语法本身，而是 DeerFlow 的配置约定：

```text
module.path:variable_name
```

`resolve_variable()` 会把冒号前面的部分交给 `import_module()`，再从模块上取冒号后面的变量，并校验它是 `BaseTool` 实例。

这带来两个工程含义：

- 配置里的 `name` 更像“人读配置时的标签”，最终绑定时以 `BaseTool.name` 为准。
- 工具加载失败可能发生在运行期：模块路径错、变量名错、依赖没装、或者变量不是 `BaseTool`，都会在动态解析时暴露。

## 可见性不是简单白名单

DeerFlow 2.x 的工具可见性来自多个门。

`tool_groups` 是 custom agent 的粗粒度白名单。`_make_lead_agent()` 会把 `agent_config.tool_groups` 传给 `get_available_tools()`，于是配置工具先按 group 过滤。

host bash 是安全边界。即使 `config.yaml` 里配置了 `bash`，`get_available_tools()` 也会先调用 `is_host_bash_allowed(config)`；不允许时会移除 group 为 `bash` 或 `use == "deerflow.sandbox.tools:bash_tool"` 的工具。

模型能力也会影响工具可见性。`view_image_tool` 只有在解析出的 model config 声明 `supports_vision` 时才会追加。

skill policy 是下一道门。`filter_tools_by_skill_allowed_tools()` 读取已加载 skill 的 `allowed_tools`：如果没有任何 skill 显式声明 `allowed_tools`，保持 legacy allow-all；只要有 skill 显式声明，就只保留声明集合里的工具名。

子 Agent 还有额外约束。`task_tool` 在创建子 Agent 工具集时会把 `subagent_enabled=False` 传给 `get_available_tools()`，避免递归暴露 `task`。同时它会继承父 Agent 的 `tool_groups`，让子 Agent 不绕过父 Agent 的工具限制。

## 内置工具不是一种东西

读 tools 模块时，一个常见误区是以为每个 tool 都只是“函数调用”。DeerFlow 的内置工具至少有几种不同形态。

### 普通执行工具

大多数工具是 LangChain `@tool` 包出来的 `BaseTool`。函数签名和 docstring 变成模型可见的 schema；模型发出 matching `tool_call` 后，ToolNode 执行底层函数。

典型例子包括 sandbox 里的 `read_file`、`write_file`、`grep`、`bash`，以及 web search / web fetch 类工具。

### 状态更新工具

`present_files` 是状态更新工具的代表，源码在 `backend/packages/harness/deerflow/tools/builtins/present_file_tool.py`。

它不是只返回一段文本，而是返回 LangGraph `Command`：

```text
present_files(filepaths)
  -> 校验路径必须位于当前 thread 的 outputs 目录
  -> 归一化为 /mnt/user-data/outputs/*
  -> Command(update={
       "artifacts": normalized_paths,
       "messages": [ToolMessage(...)]
     })
```

`ThreadState.artifacts` 有 reducer `merge_artifacts`，负责合并和去重。也就是说，工具执行结果会变成下一轮图状态的一部分，前端再根据 artifacts 呈现可查看、可下载或可渲染的文件。

### 控制流工具

`ask_clarification` 的函数体本身只是占位。真正行为在 `ClarificationMiddleware`。

实际链路是：

```text
model emits ask_clarification tool_call
  -> ClarificationMiddleware.wrap_tool_call 拦截
  -> 格式化 question/context/options
  -> 生成 ToolMessage(name="ask_clarification")
  -> Command(update={"messages": [tool_message]}, goto=END)
  -> 当前 graph run 结束，等待用户下一条 HumanMessage
```

这个模式对 Agent 工程很重要：需要用户输入时，不应该让工具函数阻塞等待人类；应该把它建模成一次 interrupt，让运行图停在可恢复的状态上。

### 委派工具

`task` 是 subagent 入口，源码在 `backend/packages/harness/deerflow/tools/builtins/task_tool.py`。

它的大致状态流是：

```text
model emits task(description, prompt, subagent_type)
  -> 校验 subagent_type
  -> 继承父级 sandbox/thread/model/tool_groups/skill policy 上下文
  -> 用 subagent_enabled=False 构造子 Agent 工具集
  -> 创建 SubagentExecutor
  -> 后台启动执行
  -> stream task_started / task_running / task_completed 等事件
  -> 把子 Agent 最终结果作为 tool result 返回给父 Agent
```

注意这里的设计语义：在 2.x 中，父 Agent 能否委派子 Agent，直接表现为工具列表里有没有 `task_tool`。这很实用，但也让“能力策略”和“工具列表 mutation”耦合在一起。

### 外部集成工具

MCP tools 不是从本地 Python 配置动态 import 出来的。它们来自启用的 MCP server，被转换成 LangChain `BaseTool` 后缓存起来。

`get_available_tools()` 会从 `deerflow.mcp.cache.get_cached_mcp_tools()` 取缓存工具，并用 `tag_mcp_tool()` 给这些工具加 `deerflow_mcp` metadata。这个 tag 后续会被 deferred tool assembly 读取。

ACP agent 则是另一类外部集成：如果配置了 ACP agents，`get_available_tools()` 会通过 `build_invoke_acp_agent_tool(acp_agents)` 构造一个 `invoke_acp_agent` 工具。

## MCP deferred tools：为什么工具存在但 schema 不一定暴露

`config.example.yaml` 里有 `tool_search.enabled` 开关。开启后，MCP tools 不会把完整 schema 一次性塞给模型，而是先只在 prompt 里列名字，等模型需要时再调用 `tool_search` 获取 schema。

目的很直接：

```text
MCP server 可能暴露很多工具。
一次性绑定全部 schema 会增大 prompt、增加成本，也会干扰模型选工具。
```

完整链路如下：

```text
get_available_tools()
  -> MCP tools loaded from cache
  -> tag_mcp_tool(t)

_make_lead_agent()
  -> filter_tools_by_skill_allowed_tools(...)
  -> assemble_deferred_tools(filtered, enabled=tool_search.enabled)

assemble_deferred_tools()
  -> 找出 is_mcp_tool(t) 的工具
  -> 构造 DeferredToolCatalog
  -> 构造 tool_search closure
  -> 返回 final_tools + DeferredToolSetup

apply_prompt_template()
  -> 渲染 <available-deferred-tools>
     只列 deferred tool names

DeferredToolFilterMiddleware.wrap_model_call()
  -> 未 promoted 的 deferred tool schema 不给模型

model calls tool_search(query)
  -> 返回匹配工具的完整 schema
  -> Command(update={
       "promoted": {"catalog_hash": ..., "names": [...]},
       "messages": [ToolMessage(...)]
     })

DeferredToolFilterMiddleware.wrap_tool_call()
  -> 如果模型直接调用未 promoted 的 deferred tool，返回 error ToolMessage
```

`ThreadState.promoted` 的 reducer `merge_promoted()` 会用 `catalog_hash` 做作用域：hash 没变就合并 promoted names；hash 变了就替换。这样可以避免“旧状态里的同名 promotion”在 MCP 配置变化后错误地暴露另一个工具。

这条链路是 DeerFlow 2.x 里很好的学习样本：一个看似简单的“工具搜索”功能，其实横跨 metadata、工具装配、prompt、middleware、graph state 和 `Command`。

## 状态流：工具怎么影响下一轮

可以把 DeerFlow 的工具执行结果分成三类：

```text
纯文本结果
  -> 进入 messages，下一轮模型能读到

Command(update=...)
  -> 写入 ThreadState 的某些字段，再由 reducer 合并

Command(..., goto=END)
  -> 不只是写状态，还改变图控制流
```

和 tools 模块关系最密切的 `ThreadState` 字段有：

- `artifacts`：由 `present_files` 更新，用 `merge_artifacts` 合并去重。
- `promoted`：由 `tool_search` 更新，用 `merge_promoted` 按 catalog hash 管理 deferred tool promotion。
- `viewed_images`：配合 vision tool/middleware 使用，支持图像内容注入后清理。
- `todos`：plan mode 下由 todo middleware 使用，虽然不是 tools assembly 主线，但体现了同一套 state reducer 风格。

因此，读 Agent 工程时不要只追模型输出和工具函数返回值。真正决定下一轮行为的是：

```text
tool result
  -> ToolMessage / Command
  -> ThreadState reducer
  -> middleware sees updated state
  -> next model request tools/messages/prompt
```

## 调试时怎么找

当你发现“某个工具不见了”时，不要直接去工具实现里找。按这条路径排查更快：

```text
1. config.example.yaml / 实际 config.yaml
   -> tools[*].use 写对了吗？group 对吗？

2. backend/packages/harness/deerflow/tools/tools.py
   -> get_available_tools() 有没有按 groups 过滤？
   -> host bash 是否被 is_host_bash_allowed() 拦掉？
   -> model 是否 supports_vision？
   -> tool.name 是否和另一个工具重复？

3. backend/packages/harness/deerflow/skills/tool_policy.py
   -> 是否有 skill.allowed_tools 把它过滤掉？

4. backend/packages/harness/deerflow/tools/builtins/tool_search.py
   -> 如果是 MCP tool，是否被 deferred？
   -> tool_search.enabled 是否开启？

5. backend/packages/harness/deerflow/agents/middlewares/deferred_tool_filter_middleware.py
   -> schema 是否还没 promoted？
   -> 是否直接调用了未 promoted 的 deferred tool？
```

当你发现“工具执行了但前端没看到结果”时，优先看状态流：

```text
present_files
  -> 是否返回 Command(update={"artifacts": ...})？
  -> 路径是否在 /mnt/user-data/outputs 下？
  -> ThreadState.artifacts reducer 是否合并成功？
```

当你发现“澄清问题没有继续跑”时，这通常不是 bug。`ask_clarification` 的预期行为就是 middleware 返回 `goto=END`，等待用户下一条消息继续线程。

## 2.x 源码事实和 3.0 观察分开看

以上都是当前 2.x 源码事实。基于 `tutorials/deerflow-3.0-design-notes/01-tool-system.md`，可以抽出几个 3.0 设计观察。

第一，工具注册、工具策略、工具运行时值得分开建模。

2.x 的 `get_available_tools()` 同时处理工具发现、配置过滤、安全策略、MCP cache、子 Agent 开关、兼容性 wrapper、重复名处理。它能工作，但当工具消失或 schema 没暴露时，调试者要跨多个模块重建原因。3.0 可以把它显式拆成：

```text
ToolRegistry
  -> 系统里注册了什么能力

ToolPolicy
  -> 本次 run 允许暴露什么，拒绝原因是什么

ToolRuntime
  -> 工具怎么执行，如何超时、取消、写状态、产生日志和事件
```

第二，subagent 更像 capability，不只是一个工具。

2.x 里 `subagent_enabled=True` 的表现是追加 `task_tool`。3.0 可以把它建模成 agent capability policy，例如“允许哪些 subagent、是否允许嵌套、最大并发是多少”，再由 policy 派生出工具暴露。

第三，MCP cache 应该更像显式 snapshot。

2.x 为了热更新，会在工具装配时重新读取 `ExtensionsConfig.from_file()`，并用 mtime 判断 MCP cache 是否 stale。这解决了 Gateway API 和 LangGraph runtime 跨进程配置刷新问题，但也让工具装配函数隐含了文件读取。3.0 可以考虑让 agent builder 消费明确的 `ToolCatalogSnapshot`，把 app config version、extensions config version、tools 和 generated time 放在一起。

这些观察不是说 2.x 错了。相反，2.x 代码展示的是一个实际系统为了兼容 LangChain/LangGraph、配置热更新、MCP 扩展和 skill 权限所做的工程折中。

## 忘了怎么找回

如果过几天忘了 tools 模块，按这张地图恢复，不要重读所有文件。

一句话：

```text
get_available_tools() 生成候选工具集；_make_lead_agent() 再叠加 skill policy、deferred tool 和 middleware，把它变成一次 run 的最终能力。
```

四个入口：

```text
想知道工具从哪里来：
  backend/packages/harness/deerflow/tools/tools.py

想知道工具怎么进入 agent：
  backend/packages/harness/deerflow/agents/lead_agent/agent.py

想知道 MCP 工具为什么只见名字不见 schema：
  backend/packages/harness/deerflow/tools/builtins/tool_search.py
  backend/packages/harness/deerflow/agents/middlewares/deferred_tool_filter_middleware.py

想知道工具怎么写状态：
  backend/packages/harness/deerflow/agents/thread_state.py
  backend/packages/harness/deerflow/tools/builtins/present_file_tool.py
```

三个关键区别：

```text
config name != tool.name
  最终路由看 BaseTool.name。

工具可见 != 工具可执行
  deferred MCP tool 可被 ToolNode 持有，但 schema 先不暴露给模型。

工具返回值 != 纯文本
  Command 可以更新 ThreadState，也可以 goto=END 改变控制流。
```

读到这里就可以先停。sandbox 具体怎么执行文件和 bash、subagent executor 怎么管理后台任务、skills 怎么加载和注入 prompt，都应该放到各自模块继续读。对于 tools assembly 这一章，掌握“候选集 -> 策略过滤 -> 延迟暴露 -> 状态更新”这条线就够了。
