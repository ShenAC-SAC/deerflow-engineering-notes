# Skills System

## One-line Mental Model

Skill 是 DeerFlow 的能力包格式：它把一段可复用的工作说明、相关资源文件，以及可选的工具权限边界放在同一个目录里。运行时不会盲目把所有 skill 内容塞进上下文，而是先让模型看到可用清单，再按需要加载或显式激活。

```text
skill = SKILL.md + support files + metadata + optional allowed-tools
      -> storage discovers it
      -> prompt lists it
      -> runtime loads it when needed
      -> tool policy may narrow tools
```

## System Position

Upstream:

- `config.skills`
- `extensions` 中的 enabled/disabled 状态
- lead agent prompt assembly
- `SkillActivationMiddleware`
- `skill_manage` 工具
- Gateway / client 的 `.skill` 安装入口

Downstream:

- local filesystem skill storage
- `SKILL.md` parser and validator
- security scanner
- lead agent and subagent tool filtering
- sandbox-mounted `/mnt/skills` path

Core files:

```text
backend/packages/harness/deerflow/config/skills_config.py
backend/packages/harness/deerflow/skills/storage/skill_storage.py
backend/packages/harness/deerflow/skills/storage/local_skill_storage.py
backend/packages/harness/deerflow/skills/parser.py
backend/packages/harness/deerflow/skills/validation.py
backend/packages/harness/deerflow/skills/installer.py
backend/packages/harness/deerflow/skills/security_scanner.py
backend/packages/harness/deerflow/skills/tool_policy.py
backend/packages/harness/deerflow/agents/middlewares/skill_activation_middleware.py
backend/packages/harness/deerflow/agents/lead_agent/prompt.py
backend/packages/harness/deerflow/tools/skill_manage_tool.py
```

## Storage Layout

`LocalSkillStorage` 使用一个 skills root，下面分两类：

```text
<skills-root>/public/<name>/SKILL.md
<skills-root>/custom/<name>/SKILL.md
<skills-root>/custom/.history/<name>.jsonl
```

两类的语义不同：

```text
public
  内置 skill，只读。不能直接通过 skill_manage 修改。

custom
  用户自定义 skill，可以创建、编辑、删除，并记录 JSONL 历史。
```

skills root 的解析顺序来自 `SkillsConfig.get_skills_path()`：

```text
1. config.skills.path
2. DEER_FLOW_SKILLS_PATH
3. 调用方 project root 下的 skills/
4. 兼容 monorepo 的 legacy skills/
```

容器内路径使用 `config.skills.container_path`，默认 `/mnt/skills`。prompt 里给模型看的 location 是容器路径，例如：

```text
/mnt/skills/public/foo/SKILL.md
/mnt/skills/custom/bar/SKILL.md
```

## Skill Object

`Skill` 是描述对象，不承载 skill 正文本身：

```text
name
description
license
skill_dir
skill_file
relative_path
category        public | custom
allowed_tools   None | list[str]
enabled
```

其中 `enabled` 来自 `load_skills()` 每次重新读取 `ExtensionsConfig` 后的合并结果，而不是由 `SKILL.md` 直接决定。这样另一个进程更新 extensions 文件后，本进程下一次加载 skill 时可以看到变化。

## Loading Flow

`SkillStorage.load_skills(enabled_only=False)` 的主流程：

```text
遍历 public / custom 目录
  -> 找每个 SKILL.md
  -> parse_skill_file(...)
  -> 用 skill.name 做去重 key
  -> 读取 ExtensionsConfig 合并 enabled 状态
  -> enabled_only=True 时过滤
  -> 按 name 排序
```

注意去重语义：`skills_by_name[skill.name] = skill`。当前遍历顺序是 `public` 再 `custom`，所以同名 custom skill 会覆盖 public skill 的描述对象。这和 `ensure_custom_skill_is_editable()` 的提示一致：如果想定制内置 skill，需要在 `skills/custom/` 下创建同名 skill。

## Parsing And Validation

`SKILL.md` 必须以 YAML frontmatter 开头。解析时必需的是：

```yaml
---
name: repo-auditor
description: Audit a repository for a focused engineering question.
allowed-tools:
  - read_file
  - grep
---
```

关键字段：

```text
name
  必填，hyphen-case，长度不超过 64。

description
  安装校验要求字段存在，长度不超过 1024，不能包含尖括号。
  运行时加载要求它是非空字符串，否则 `parse_skill_file()` 不会返回 Skill。

allowed-tools
  可选。缺省是 None；空列表是明确声明“不给工具”；列表必须全部是非空字符串。
```

`validation.py` 还限制 frontmatter 只能包含允许字段：

```text
name
description
license
allowed-tools
metadata
compatibility
version
author
```

这一步解决的是格式可信，不解决内容安全。内容安全交给 scanner。

## Archive Installation Flow

`.skill` 安装不是把 zip 直接解到目标目录。`LocalSkillStorage.ainstall_skill_from_archive()` 把安装拆成几个阶段：

```text
1. 创建临时目录
2. safe_extract_skill_archive()
3. resolve_skill_dir_from_archive()
4. _validate_skill_frontmatter()
5. _scan_skill_archive_contents_or_raise()
6. copy 到 staging 目录
7. _move_staged_skill_into_reserved_target()
8. 清理临时目录
```

解压阶段的保护：

```text
拒绝绝对路径
拒绝 ..
拒绝 Windows 绝对路径
拒绝解压后逃出目标目录
跳过 symlink
限制总解压大小，防 zip bomb
忽略 __MACOSX 和 dotfile 元数据
```

提交阶段的保护：

```text
target.mkdir(mode=0o700)
  先预留最终目录。如果目录已存在，安装失败。

move staging children into target
  把已扫描的文件移动进最终目录。

make_skill_tree_sandbox_readable(target)
  安装后的 skill 对 sandbox 可读，但去掉写权限。

failure cleanup
  如果已经预留 target 但没有安装成功，删除 target。
```

这里的“原子安装”主要是文件系统层面的提交边界：不会一边扫描一边暴露到最终目录，也不会在目标目录已存在时覆盖旧 skill。它不是数据库事务，也不能覆盖所有文件系统异常。

## Security Scanner

scanner 的入口是 `scan_skill_content()`。它调用一个模型，把内容分类成：

```text
allow
warn
block
```

安装 `.skill` 时会扫描：

```text
SKILL.md
scripts/**              作为 executable 扫描
references/**/*.{md,txt,yaml,json,...}
templates/**/*.{md,txt,yaml,json,...}
```

规则上有两个重要点：

```text
普通说明文件
  allow 或 warn 可以继续；block 拒绝。

executable 内容
  必须 allow；warn 也会被拒绝。
```

如果 scanner 调用失败，或者模型返回不可解析内容，当前实现保守拒绝。这个策略是对的：skill 安装和 agent-managed skill 写入都会改变后续 agent 的行为，不能在 scanner 不确定时放行。

但 scanner 不是强安全边界。它能拦截明显恶意内容，不能替代 sandbox、工具权限和用户授权。

## Runtime Injection

lead agent 的 skill 注入分两条路径。

第一条是普通可用清单。`get_skills_prompt_section()` 只把已启用、且属于当前 agent 可用范围的 skill 列出来：

```text
<available_skills>
  <skill>
    <name>...</name>
    <description>...</description>
    <location>/mnt/skills/.../SKILL.md</location>
  </skill>
</available_skills>
```

这里不会把所有 `SKILL.md` 正文直接塞进 prompt。模型需要某个 skill 时，按 location 去 `read_file`，再读取必要的 support files。这是 progressive loading：先给目录，不一次性给全文。

第二条是显式 slash activation。用户输入 `/skill-name ...` 时，`SkillActivationMiddleware` 会：

```text
解析 /skill-name
  -> 确认 skill 已安装、已启用、在当前 agent 可用范围内
  -> 安全读取对应 SKILL.md
  -> 计算 content hash
  -> 插入一条 hide_from_ui=True 的 HumanMessage
```

这条 hidden message 包含完整 skill 内容和用户剩余任务文本。因为用户已经显式指定 skill，所以运行时直接注入内容，模型不需要再次 `read_file` 主文件。

## Tool Policy

`allowed-tools` 是 skill 对工具权限的声明。lead agent 和 subagent 都会通过 `filter_tools_by_skill_allowed_tools()` 过滤工具列表。

当前语义是：

```text
没有加载 skill
  -> None，保持 legacy allow-all。

加载的 skill 都没有声明 allowed-tools
  -> None，保持 legacy allow-all。

只要有任意 skill 声明 allowed-tools
  -> 取所有显式声明的并集。
     没声明的 skill 不贡献工具。

allowed-tools: []
  -> 明确声明该 skill 不需要任何工具。
```

这说明 `allowed-tools` 会参与运行时工具列表过滤，超出了提示词建议的范围。

## Agent-managed Skill Writes

`skill_manage_tool` 允许 agent 管理 custom skill：

```text
create
edit
patch
delete
write_file
remove_file
```

边界：

```text
只能操作 custom skill
  public skill 不能直接修改。

每个 skill 有进程内 asyncio.Lock
  同一进程内避免并发写同一个 skill。

每次写入前验证 frontmatter / path
  SKILL.md 要重新验证；support file 必须在 references/templates/scripts/assets 下。

每次写入前扫描
  scripts 按 executable 扫描。

写入后记录 JSONL history
  history 记录 action、thread_id、前后内容、scanner 结果。

更新 prompt cache
  create/edit/patch/delete 会刷新 skills prompt cache。
```

这里的并发锁只在当前 Python 进程内生效。多个 Gateway 进程共享同一 skills 目录时，`skill_manage_tool` 的写入没有跨进程锁。这是一个真实的架构债。

## State And Config

主要配置：

```text
AppConfig.skills.path
AppConfig.skills.container_path
AppConfig.skill_evolution.enabled
AppConfig.skill_evolution.moderation_model_name
ExtensionsConfig skills enabled state
agent config available_skills
subagent config skills
```

主要 runtime state：

```text
lead prompt
  可用 skill 清单，不含全部正文。

hidden HumanMessage
  slash activation 时注入完整 SKILL.md。

tool list
  根据 enabled skills 的 allowed-tools 过滤。

filesystem
  public/custom skill 文件和 custom history。
```

## Design Tradeoffs

### Progressive loading reduces context cost

默认只列 skill 名称、描述和路径，避免每次 run 都把所有 skill 正文塞进上下文。代价是模型必须知道何时加载 skill，加载失败也会影响执行质量。

### Scanner fail-closed is safer, but not deterministic

scanner 失败时拒绝安装和写入，这符合安全边界。但模型 scanner 本身不稳定、不可完全解释，也不适合成为唯一审查层。

### `allowed-tools` is simple, but coarse

并集语义容易实现，也兼容多个 skill 同时启用。但如果某个 run 只激活一个 skill，当前策略仍可能受到“本 agent 所有已加载 skill 的 allowed-tools 并集”影响，而不是当前任务实际激活 skill 的最小集合。

### public/custom overlay is useful, but should be visible

同名 custom 可以覆盖 public，这方便定制，但也需要 UI 或诊断工具清楚展示“当前生效的是哪一个 skill”，否则排查时容易读错文件。

## Risks

- LLM security scanner 适合作为一层语义拦截，不能作为唯一安全依据。
- `skill_manage_tool` 的锁是进程内锁，不适合多进程共享写同一 skills root。
- `allowed-tools` 使用并集，可能比当前激活 skill 的真实需求更宽。
- custom 覆盖 public 需要可观察性，否则用户可能以为自己还在使用内置版本。
- `SKILL.md` 内容通过 hidden HumanMessage 注入，仍然和其他运行时注入消息共享同一个 message list，需要结构化 provenance 才更好排查。

## Code Reading Focus

```text
SkillsConfig.get_skills_path()
SkillStorage.load_skills()
SkillStorage.ensure_custom_skill_is_editable()
LocalSkillStorage.ainstall_skill_from_archive()
safe_extract_skill_archive()
_scan_skill_archive_contents_or_raise()
scan_skill_content()
parse_skill_file()
parse_allowed_tools()
allowed_tool_names_for_skills()
filter_tools_by_skill_allowed_tools()
get_skills_prompt_section()
SkillActivationMiddleware._resolve_activation()
SkillActivationMiddleware._prepare_model_request()
_skill_manage_impl()
```
