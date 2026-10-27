# Skills：保留的设计观察

核对基线：DeerFlow 2.2.0 开发快照 `51d59a1cdff92626bd9f03f1b2254f34a824ca3e`（2026-10-27）。

本文件结合当前实现，记录需要进一步核实的设计问题。每个问题都说明已有机制与评估条件，不将候选方案视为运行行为或已确认缺陷。

## 当前机制

SkillScan 检查包内容，deferred discovery 管理渐进发现，用户 custom 存储与物理 projection 约束可见范围。受控 mutation 服务协调技能写入；allowed-tools 作为兼容元数据保存，不决定工具权限。

## 跨入口写入的并发边界

HostSkillMutationService 使用 revision、stage/check/publish、幂等与恢复机制，投影更新使用跨进程锁。归档安装、skill_manage、扩展 mutation 与外部文件编辑的事务范围需要分别检查。若要统一写入契约，先复现跨入口冲突，并指出现有 fence 覆盖不到的路径。

## 仍值得研究：来源可解释性

公共、用户 custom 与 integration 来源可能让读者困惑。先检查当前 catalog、诊断 API、skill 路径和 UI 是否能说明有效来源；只在真实排查案例缺信息时补充 effective/shadowed origin，不预先增加一套注册表。

## 大规模技能库的发现成本

skill_index + describe_skill 将完整描述改为按需读取。对大规模技能库，可评估名称索引成本、召回率和低频 skill 的可发现性，再根据实际结果决定是否调整搜索或排序。

## 核对入口

- [backend/packages/harness/deerflow/skills/describe.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/describe.py)
- [backend/packages/harness/deerflow/skills/projection.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/projection.py)
- [backend/packages/harness/deerflow/skills/skillscan/orchestrator.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/skillscan/orchestrator.py)
- [backend/packages/harness/deerflow/skills/mutations/service.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/mutations/service.py)
- [backend/packages/harness/deerflow/skills/diagnostics.py](https://github.com/bytedance/deer-flow/blob/51d59a1cdff92626bd9f03f1b2254f34a824ca3e/backend/packages/harness/deerflow/skills/diagnostics.py)

验证方式：固定提交的静态源码对照；未把真实模型、多 worker 或外部服务运行结果作为本笔记的已验证事实。
