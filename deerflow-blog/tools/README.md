# Tools 模块索引

这个模块回答一个核心问题：

```text
一次 DeerFlow agent run 到底能看到、搜索、调用哪些工具？
```

不要把 tools 模块理解成“函数注册表”。在 DeerFlow 2.x 里，它更像一次 run 的能力装配器：

```text
工具来源
-> 可见性策略
-> 延迟暴露
-> runtime 执行
-> state / middleware 协作
```

## 文章

| 顺序 | 文章 | 重点 |
| --- | --- | --- |
| 01 | [从工具列表到运行期能力](./01-tools-assembly.md) | `get_available_tools()`、skill policy、MCP deferred tools、`tool_search`、`ThreadState` |

## 复习入口

忘了 tools 模块时，先从这四个问题找回：

```text
工具从哪里来？
工具为什么会被过滤？
MCP 工具为什么先只暴露名字？
工具执行结果如何写回 ThreadState？
```

对应源码锚点：

```text
backend/packages/harness/deerflow/tools/tools.py
backend/packages/harness/deerflow/skills/tool_policy.py
backend/packages/harness/deerflow/tools/builtins/tool_search.py
backend/packages/harness/deerflow/agents/middlewares/deferred_tool_filter_middleware.py
backend/packages/harness/deerflow/agents/thread_state.py
```
