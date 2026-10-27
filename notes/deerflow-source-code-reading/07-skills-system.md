# Skill 包、发现与投影

基线：面向 DeerFlow 2.2.0 的开发快照，2026-10-27；非正式发布版。
上游提交：`51d59a1cdff92626bd9f03f1b2254f34a824ca3e`。

本文件是公开教程的阅读索引与核对记录，避免再维护一套独立长正文。

## 对应主线

- [中文教程](../../site/src/content/tutorials/zh/08-skills.mdx) · [English](../../site/src/content/tutorials/en/08-skills.mdx)

示例请求：请阅读项目资料，比较三种实现方案，生成一份带来源的 Markdown 报告。

## 已核对的当前行为

- public、用户 custom、集成来源需按真实加载与存储范围理解。
- skill_index → describe_skill → read_file 与显式 slash 激活是两条加载路径。
- 可见、可激活、物理文件可读、工具可执行分别受不同机制约束。
- allowed-tools 是元数据，不参与工具过滤；managed projection 约束实际技能文件视图。
- 归档检查、静态扫描、模型审查、revision 检查和发布不能概括为直接解压。

## 源码阅读入口

- [backend/packages/harness/deerflow/skills/types.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/types.py)
- [backend/packages/harness/deerflow/skills/parser.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/parser.py)
- [backend/packages/harness/deerflow/skills/storage/user_scoped_skill_storage.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/storage/user_scoped_skill_storage.py)
- [backend/packages/harness/deerflow/skills/describe.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/describe.py)
- [backend/packages/harness/deerflow/skills/projection.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/projection.py)
- [backend/packages/harness/deerflow/skills/installer.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/installer.py)
- [backend/packages/harness/deerflow/skills/skillscan/orchestrator.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/skillscan/orchestrator.py)
- [backend/packages/harness/deerflow/agents/middlewares/skill_activation_middleware.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/agents/middlewares/skill_activation_middleware.py)
- [backend/packages/harness/deerflow/authz/skill_filter.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/authz/skill_filter.py)
- [backend/packages/harness/deerflow/tools/skill_manage_tool.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/tools/skill_manage_tool.py)
- [backend/packages/harness/deerflow/skills/mutations/service.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/mutations/service.py)

优先跟踪：`Skill`, `UserScopedSkillStorage`, `build_describe_skill_tool`, `SkillActivationMiddleware`, `safe_extract_skill_archive`, `HostSkillMutationService`。

## 验证边界

这些结论来自固定提交的源码阅读与双语教程对照。站点校验检查文件、Python 定义、版本和页面链接，不替代真实模型、远端 sandbox、数据库或多 worker 的运行测试。条件性能力按正文中的配置、身份与生命周期前提理解。
