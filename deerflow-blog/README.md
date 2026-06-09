# DeerFlow 源码阅读博客

这个目录把 `tutorials/deerflow-source-code-reading/` 里的源码阅读笔记改写成更适合公开阅读的博客化文档。

定位上，它不是原始笔记的替代品，而是一层面向工程读者的导读：先建立心智模型，再给调用链和状态流，最后给一张“忘了怎么找回”的复习地图。事实部分以 DeerFlow 2.x 代码和现有 tutorials 笔记为准；设计观察会单独标注为 3.0 方向，避免和 2.x 源码事实混在一起。

## 模块目录

| 模块 | 适合解决的问题 | 当前文章 |
| --- | --- | --- |
| [Tools](./tools/README.md) | 一个 Agent run 到底能看到哪些工具？工具如何被配置、过滤、延迟暴露、执行并写回状态？ | [01. 从工具列表到运行期能力](./tools/01-tools-assembly.md) |

## 阅读建议

如果你刚接触大型 Agent 工程，先不要试图一次读完所有工具实现。建议按这个顺序走：

1. 先读 tools 装配链，理解“工具可见性”是怎么被算出来的。
2. 再读几个代表性工具，区分普通执行、状态更新、控制流中断、子 Agent 委派。
3. 最后回到 middleware 和 `ThreadState`，看工具调用如何影响下一轮模型输入和前端可见状态。

## 事实边界

- 2.x 源码事实：来自当前仓库代码、`tutorials/deerflow-source-code-reading/` 笔记和 `config.example.yaml`。
- 3.0 设计观察：来自 `tutorials/deerflow-3.0-design-notes/`，在正文中会明确标注为观察或建议。
- 本目录不修改原始 source-code-reading 笔记，方便以后对照校验。
