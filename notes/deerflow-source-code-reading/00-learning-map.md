# 从一句 prompt 到一次 Agent 运行

基线：DeerFlow 2.2.0 开发快照（2026-10-27），`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。上游尚未正式发布 2.2.0。

## 贯穿案例

> 请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

九站是阅读顺序，不是强制执行每个模块一次的固定流水线。Skills 在装配期参与发现，sandbox 可延迟创建，子 agent 只在适合委派时启动。

1. 输入、上传与 Gateway run 准入。
2. assemble_lead_agent：模型、能力、graph 与装配描述。
3. 工具候选、授权、deferred 可见性和执行边界。
4. middleware 准备上下文与模型请求视图。
5. middleware 裁决输出、执行工具、保存凭据与收尾。
6. sandbox 的路径、资源身份与 execution lease。
7. 子 agent 的隔离上下文、预算与验收。
8. skill 发现、激活、包扫描和文件投影。
9. checkpoint、run、事件、流与文件的恢复边界。

```text
prompt → frontend → Gateway.start_run → RunManager
       → run_agent → assemble_lead_agent → graph.astream
       → middleware / model / tools / sandbox / optional subagent
       → events + checkpoints + completion + artifact delivery
```

## Extension 专题

主线保持九站；跨站能力单独讲解：

- [扩展机制](../../site/src/content/extensions/zh/extension-system.mdx)：加载、声明式贡献、middleware placement、宿主能力与证据。
- [记忆后端](../../site/src/content/extensions/zh/memory-backends.mdx)：MemoryManager、middleware/tool 模式、身份与关机边界。
- [长期目标与调度](../../site/src/content/extensions/zh/goals-and-scheduling.mdx)：goal、run、task、occurrence 的不同生命周期。

Extension 是站点阅读分区，不表示所有专题都必须作为 Python plugin 安装。

## 如何继续维护

公开正文以 `site/src/content/` 为准；这里保存对应模块的阅读入口与语义核对点。
版本元数据位于 `site/src/data/source.json`。每次升级先固定上游 SHA，再改写语义，最后同步 frontmatter 与行内源码引用。
源码引用检查只确认引用与符号存在，不能自动验证正文结论。

`deerflow-3.0-design-notes` 目录记录个人设计观察，分别说明当前机制、待核实问题与评估条件。运行行为以固定提交的源码和公开教程为准。
