# Sandbox System

## One-line Mental Model

Sandbox 是 DeerFlow 的工具执行环境层。它给模型一个稳定的虚拟文件系统和命令执行接口，执行位置取决于 provider：Local 模式是在 Gateway 所在机器上通过本地文件系统和 host shell 执行；AIO 模式是通过 HTTP client 调用容器或 Pod 内部的 shell/file API。

## System Position

Upstream:

- `SandboxMiddleware`
- `deerflow.sandbox.tools`
- LangGraph ToolNode 注入的 `Runtime`

Downstream:

- `SandboxProvider`
- `LocalSandboxProvider` / `AioSandboxProvider`
- `LocalSandbox` / `AioSandbox`
- Docker / Apple Container / provisioner / k3s Pod
- per-user, per-thread workspace directories

Main shape:

```text
tool call
  -> sandbox tool function
  -> ensure_sandbox_initialized(runtime)
  -> provider.acquire(thread_id)
  -> provider.get(sandbox_id)
  -> Sandbox implementation
  -> execute_command / read_file / write_file / glob / grep
```

ToolNode 不会自动“进入 sandbox”。ToolNode 只调用工具并注入 runtime。把工具调用绑定到 sandbox 的，是 `ensure_sandbox_initialized()` 和 provider。

## Core Abstractions

`Sandbox` 是执行接口：

```text
execute_command(command)
read_file(path)
write_file(path, content)
list_dir(path)
glob(path, pattern)
grep(path, pattern)
download_file(path)
```

`SandboxProvider` 是生命周期和资源定位接口：

```text
acquire(thread_id) -> sandbox_id
get(sandbox_id) -> Sandbox instance
release(sandbox_id)
shutdown()
```

不要把 sandbox provider 和 model provider 混在一起：

```text
model provider   -> 模型调用能力
sandbox provider -> 工具执行环境能力
```

## Thread Identity

这里的 `thread_id` 不是 Python thread，也不是 OS thread。它是 DeerFlow 的会话/任务上下文 ID。

三个概念要分开：

```text
OS process      一个 Python 服务进程，拥有独立内存
Python thread   进程内部执行单元，共享同一份进程内存
DeerFlow thread 一条对话/任务的业务身份，也就是 thread_id
```

`thread_id` 由上游 client/gateway/run 系统传入。Embedded client 会把它放进 `RunnableConfig.configurable.thread_id`；Gateway worker 会把 `record.thread_id` 放进 `Runtime.context["thread_id"]`。Sandbox 工具两边都查，是为了兼容两条运行路径：

```python
thread_id = runtime.context.get("thread_id")
if thread_id is None:
    thread_id = runtime.config.get("configurable", {}).get("thread_id")
```

进程重启后，Python 内存里的 provider cache 会丢失，但上游继续同一个会话时仍会传入同一个 `thread_id`。因此 sandbox provider 可以用它重新定位外部资源。

## Local Sandbox

Local 模式不是强隔离沙箱。它是宿主机文件系统和宿主机 shell 的适配层。

核心路径：

```text
LocalSandboxProvider.acquire(thread_id)
  -> build per-thread path mappings
  -> LocalSandbox("local:{thread_id}", path_mappings=...)

LocalSandbox.execute_command(command)
  -> resolve virtual paths
  -> subprocess.run([shell, "-c", command])
  -> reverse-resolve host paths in output
```

Local 的虚拟路径靠 Python 映射成立：

```text
/mnt/user-data/workspace/a.py
  -> {base_dir}/users/{user_id}/threads/{thread_id}/user-data/workspace/a.py
```

文件工具走受控文件 API；bash 工具走宿主机 shell。所以 Local bash 必须有 host bash gating。

## Host Bash Gating

`is_host_bash_allowed()` 判断当前 sandbox provider 是否是 Local，以及配置里是否显式允许 `sandbox.allow_host_bash`。

原因很直接：

```text
Local bash 不是容器里的 bash
Local bash 是 Gateway 进程所在机器上的 shell
```

路径校验、虚拟路径替换、输出脱敏只能降低误伤，不能把宿主机 shell 变成强隔离边界。复杂 shell、环境变量、系统命令、副作用都很难靠字符串校验完全封住。

所以当前策略是：

```text
Local provider + allow_host_bash=False -> 拒绝 bash
Local provider + allow_host_bash=True  -> 允许 host bash
非 Local provider                     -> bash 在 sandbox/container 内执行
```

这里不应使用 `ask_clarification`。澄清问题归模型，权限授权归 runtime。一个更合理的 3.0 方向是 runtime-level approval gate，例如：

```text
sandbox.host_bash_policy: deny | ask | allow
```

`ask` 表示由运行时暂停、展示命令和风险、等待用户批准，并记录审计事件。它不是模型层的澄清问题。

## AIO Sandbox

AIO 在这里可以理解成 All-In-One sandbox runtime。它不是 Python 的 asyncio。

核心路径：

```text
AioSandboxProvider.acquire(thread_id)
  -> locate or create sandbox container/pod
  -> AioSandbox(id, base_url)

AioSandbox.execute_command(command)
  -> AioSandboxClient(base_url)
  -> HTTP request
  -> AIO container shell API
```

`HTTP client` 是 Gateway 进程里的 Python 客户端，用 HTTP 请求遥控 sandbox 容器。执行命令和读写文件的是容器内的 AIO API，不是 Gateway 进程自己。

本地 Docker 场景：

```text
Gateway process
  -> LocalContainerBackend
  -> docker/container run all-in-one-sandbox
  -> AioSandboxClient(http://localhost:{port})
  -> container shell/file API
```

远端 provisioner 场景：

```text
Gateway process
  -> RemoteSandboxBackend
  -> POST /api/sandboxes
  -> provisioner creates Pod + Service
  -> AioSandboxClient(sandbox_url)
  -> pod shell/file API
```

AIO 的虚拟路径靠容器挂载成立：

```text
host workspace dir -> /mnt/user-data/workspace
host uploads dir   -> /mnt/user-data/uploads
host outputs dir   -> /mnt/user-data/outputs
skills dir         -> /mnt/skills, read-only
ACP workspace      -> /mnt/acp-workspace, read-only
```

所以 AIO 模式下，`tools.py` 通常不需要把 `/mnt/user-data/...` 替换成 host path；容器内本来就能看到这些路径。

## AIO Acquire Flow

`acquire(thread_id)` 的目的不是执行命令。它负责给当前 DeerFlow thread 找到一个可用 sandbox，并返回 `sandbox_id`。

展开后的流程：

```text
acquire(thread_id)
  -> 拿同一 thread 的进程内锁
  -> 查当前进程 active cache
  -> 用 thread_id 计算稳定 sandbox_id
  -> 查 warm pool
  -> 拿跨进程 file lock
  -> backend.discover(sandbox_id)
  -> backend.create(...)
```

每一步解决的问题不同：

```text
进程内锁
  防止同一个 Python 进程内两个请求同时给同一 thread 创建 sandbox。

active cache
  当前进程已经持有 AioSandbox client 时，直接复用。

deterministic sandbox_id
  sha256(thread_id)[:8]，让不同进程和重启后的进程都能从同一个 thread_id 算出同一个 sandbox 资源名。

warm pool
  release 后暂时不销毁的容器池。容器继续跑，HTTP client 关闭；下轮同一 thread 可以快速 reclaim。

file lock
  多个 Python 进程之间不共享内存，用锁文件序列化 discover/create，避免同时创建同一个容器。

backend.discover
  当前进程内存没有，但 Docker/provisioner 里可能已有容器/Pod。discover 成功后，当前进程重新构造 AioSandbox client。

backend.create
  只有 cache、warm pool、discover 都失败后才创建新容器/Pod。
```

“跨进程找回”指重新连接同一个外部 sandbox 资源，不是拿回另一个进程里的 Python 对象。

## Lifecycle

生命周期触发点在 `SandboxMiddleware`，策略在 provider。

```text
before_agent
  lazy_init=False 时提前 acquire

tool call
  lazy_init=True 时第一次 sandbox 工具调用才 acquire

after_agent
  调 provider.release(sandbox_id)

shutdown
  调 provider.shutdown()
```

`release()` 不等于 `destroy()`。

Local:

```text
release() 是 no-op
LocalSandbox 留在 LRU cache
没有容器或 HTTP client 要释放
```

AIO:

```text
release()
  -> 从 active cache 移除
  -> 关闭 host-side HTTP client
  -> SandboxInfo 放入 warm pool
  -> 容器继续运行

destroy()
  -> stop 容器或删除 Pod

idle checker
  -> 超过 idle_timeout 的 active/warm sandbox 会被销毁
```

`SandboxMiddleware` 注释里“not released after each agent call”容易误导。当前代码确实在 `after_agent()` 调用 `release()`；只是 provider 语义保证了 release 不一定销毁资源。

## Path Virtualization

路径虚拟化解决的是模型看到的路径稳定性，而不是单独构成安全边界。

模型看到：

```text
/mnt/user-data/workspace
/mnt/user-data/uploads
/mnt/user-data/outputs
/mnt/skills
/mnt/acp-workspace
```

宿主机实际路径：

```text
{base_dir}/users/{user_id}/threads/{thread_id}/user-data/workspace
{base_dir}/users/{user_id}/threads/{thread_id}/user-data/uploads
{base_dir}/users/{user_id}/threads/{thread_id}/user-data/outputs
{base_dir}/users/{user_id}/threads/{thread_id}/acp-workspace
```

Local 模式：

```text
validate virtual path
resolve to host path
verify resolved path stays under allowed roots
execute local file operation
mask host path back to virtual path in output
```

AIO 模式：

```text
mount host directories into container
container sees virtual path directly
HTTP file/shell API operates inside container
```

隔离层次：

```text
user_id
  -> thread_id
      -> workspace / uploads / outputs / acp-workspace
```

`thread_id` 和 `user_id` 都会做路径字符校验，避免被当作路径穿越片段。

## Tool Layer Pattern

`tools.py` 是 LangChain tool 到 Sandbox 接口的适配层。

一般模式：

```text
ensure_sandbox_initialized(runtime)
ensure_thread_directories_exist(runtime)
if local:
  validate path
  resolve virtual path to host path
call sandbox method
format/truncate/mask output
```

`bash` 是特殊工具：

```text
Local bash:
  host bash gating
  validate bash command paths
  replace virtual paths
  cd thread workspace
  subprocess shell
  mask host paths

AIO bash:
  execute command through container shell API
```

`write_file` 和 `str_replace` 会按 `(sandbox_id, path)` 加锁，防止同一个 sandbox 内并发写同一个文件互相覆盖。这个锁是文件一致性保护，不是安全边界。

`write_file` 还有默认 80 KB 单次非 append 写入上限。原因是模型必须把 tool-call JSON 连续流式输出；超大 payload 容易触发 streaming chunk-gap timeout。

## Key Takeaways

- Sandbox state 只存 `sandbox_id`，执行对象由 provider 管。
- `runtime.state["sandbox"] = ...` 是工具调用期间对当前 runtime state 的直接修改，不等于已经通过 LangGraph checkpoint 持久化；需要 `Command(update=...)` 才能稳定写回 graph state。
- `ThreadState.sandbox` 的 reducer 是 DeerFlow 手写的 `merge_sandbox`，不是 LangGraph 自动生成；当前代码把字段类型抽成 `SandboxStateField`，只是复用类型别名，语义不变。
- Local sandbox 是宿主机适配层，不是强隔离边界。
- 当前 local bash 路径校验减少了模板字符串和非 ASCII 文本的误报，但它仍然只是 best-effort guard，不是隔离边界。
- AIO sandbox 是容器/Pod 执行层，通过 HTTP client 调用容器 API。
- `thread_id` 是业务会话身份；`sha256(thread_id)[:8]` 是稳定 sandbox 资源名。
- active cache 是当前进程内存；discover 找的是外部 Docker/provisioner 里的真实资源。
- warm pool 是 release 后暂时保留的热容器池，用来减少冷启动。
- 路径虚拟化让模型看到稳定路径，但安全仍依赖 provider、路径校验、挂载权限、host bash gate 和容器边界。

## Code Reading Focus

Core files:

```text
backend/packages/harness/deerflow/sandbox/tools.py
backend/packages/harness/deerflow/sandbox/middleware.py
backend/packages/harness/deerflow/sandbox/sandbox.py
backend/packages/harness/deerflow/sandbox/sandbox_provider.py
backend/packages/harness/deerflow/sandbox/local/local_sandbox.py
backend/packages/harness/deerflow/sandbox/local/local_sandbox_provider.py
backend/packages/harness/deerflow/community/aio_sandbox/aio_sandbox.py
backend/packages/harness/deerflow/community/aio_sandbox/aio_sandbox_provider.py
backend/packages/harness/deerflow/community/aio_sandbox/local_backend.py
backend/packages/harness/deerflow/community/aio_sandbox/remote_backend.py
backend/packages/harness/deerflow/config/paths.py
backend/packages/harness/deerflow/agents/thread_state.py
```

Functions worth reading:

```text
ensure_sandbox_initialized()
bash_tool()
validate_local_bash_command_paths()
replace_virtual_paths_in_command()
validate_local_tool_path()
LocalSandboxProvider.acquire()
LocalSandbox.execute_command()
AioSandboxProvider.acquire()
AioSandboxProvider._acquire_internal()
AioSandboxProvider._discover_or_create_with_lock()
AioSandboxProvider.release()
AioSandbox.execute_command()
Paths.thread_dir()
Paths.ensure_thread_dirs()
merge_sandbox()
```
