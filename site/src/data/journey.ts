// 旅程地图(单一数据源):9 站的卡片元数据,双语。
// 深读正文走 MDX(src/content/tutorials/<lang>/<slug>.mdx)。
// status:'published' 表示旅程卡片开放入口,且该站必须同时有 zh/en 正文。
// locked 站可以先有单语草稿,但不从卡片入口开放。
// 这样「地图」是数据、「深读」是内容,各自演化、互不绑架。

export type Lang = 'zh' | 'en';
export type Status = 'published' | 'locked';

export interface Station {
  station: number;          // 旅程序号,唯一
  slug: string;             // 对应 MDX 文件名(不含语言),如 02-lead-agent-factory
  status: Status;
  title: Record<Lang, string>;
  mentalModel: Record<Lang, string>;   // 一句话心智模型(卡片核心信息)
  teaser: Record<Lang, string>;        // 一句编辑式「快讯」,与心智模型互补
}

export const JOURNEY: Station[] = [
  {
    station: 1, slug: '01-request-entry', status: 'published',
    title: { zh: '请求入口与 Run 托管', en: 'Request entry and run hosting' },
    mentalModel: { zh: '把用户输入托管成可观察、可控制的 run', en: 'Host user input as an observable, controllable run' },
    teaser: {
      zh: '进入图执行前，Gateway 会先把请求登记成有生命周期、上下文、事件流和断连策略的运行单元。',
      en: 'Before graph execution, Gateway records the request as a run with lifecycle, context, event stream, and disconnect policy.',
    },
  },
  {
    station: 2, slug: '02-lead-agent-factory', status: 'published',
    title: { zh: 'lead-agent 工厂', en: 'Lead-agent factory' },
    mentalModel: { zh: '把配置装配成可运行的 agent 图', en: 'Assemble config into a runnable agent graph' },
    teaser: {
      zh: '图工厂把模型、工具、中间件、prompt 和状态结构装配成一张能运行的图；推理发生在后续的图执行阶段。',
      en: 'The graph factory assembles model, tools, middleware, prompt, and state schema into a runnable graph; reasoning happens during graph execution.',
    },
  },
  {
    station: 3, slug: '03-tools-assembly', status: 'published',
    title: { zh: '工具装配', en: 'Tool assembly' },
    mentalModel: { zh: '工具注册了，不代表这次 agent 就能用', en: 'Registered tools are not automatically available to this run' },
    teaser: {
      zh: '工具注册完成后不会全部开放；一次 run 能动用哪些外部能力，要经过配置、模型、沙箱、skill 和 MCP 策略共同收敛。',
      en: 'After tools are registered, config, model, sandbox, skills, and MCP policy still decide what this run may use.',
    },
  },
  {
    station: 4, slug: '04-middleware-pipeline', status: 'published',
    title: { zh: '中间件管线(上)· 模型调用前的运行时准备', en: 'Middleware pipeline I · preparing the run before model calls' },
    mentalModel: { zh: '模型调用前，middleware 先建立上下文、资源和协议边界', en: 'Before model calls, middleware establishes context, resources, and protocol boundaries' },
    teaser: {
      zh: '模型调用前，DeerFlow 会把目录、沙箱、上传、记忆和消息协议整理成模型可以安全消费的运行时上下文。',
      en: 'Before the model is called, DeerFlow shapes directories, sandbox, uploads, memory, and message protocol into model-ready runtime context.',
    },
  },
  {
    station: 5, slug: '05-middleware-return', status: 'published',
    title: { zh: '中间件管线(下)· 模型输出后的裁决与收尾', en: 'Middleware pipeline II · adjudication and cleanup after model output' },
    mentalModel: { zh: '模型输出之后，middleware 负责裁决、工具准入和资源收尾', en: 'After model output, middleware adjudicates, gates tools, and cleans up resources' },
    teaser: {
      zh: '模型输出会先经过安全、循环、子 agent 并发、工具边界和资源释放等处理，再决定这轮 run 是否继续。',
      en: 'Model output first passes through safety, loop, subagent fan-out, tool-boundary, and cleanup handling before the run continues.',
    },
  },
  {
    station: 6, slug: '06-sandbox', status: 'published',
    title: { zh: '沙箱系统', en: 'Sandbox system' },
    mentalModel: { zh: '工具的执行环境', en: 'The execution environment for tools' },
    teaser: {
      zh: '沙箱定义工具的执行环境和能力边界：它决定 agent 能访问哪些外部资源。',
      en: 'The sandbox defines the tool execution environment and the capability boundary for external resources.',
    },
  },
  {
    station: 7, slug: '07-subagents', status: 'published',
    title: { zh: '子 agent 系统', en: 'Subagent system' },
    mentalModel: { zh: '把复杂子任务委派给受限的完整 agent', en: 'Delegate complex subtasks to constrained full agents' },
    teaser: {
      zh: '子 agent 会在共享工作现场里启动另一个完整 agent，同时收窄工具、生命周期和结果回流。',
      en: 'A subagent starts another full agent in the shared workspace while narrowing tools, lifecycle, and result flow.',
    },
  },
  {
    station: 8, slug: '08-skills', status: 'published',
    title: { zh: '技能系统', en: 'Skill system' },
    mentalModel: { zh: '把经验沉淀成 agent 的系统能力', en: 'Turn experience into system-level agent capability' },
    teaser: {
      zh: 'skill 用来补强 agent 系统能力：把流程、资料、脚本和权限边界打包成可复用单元。',
      en: 'A skill strengthens the agent system by packaging workflows, references, scripts, and permission boundaries into reusable capability.',
    },
  },
  {
    station: 9, slug: '09-persistence', status: 'published',
    title: { zh: '持久化 · store · checkpointer', en: 'Persistence: store and checkpointer' },
    mentalModel: { zh: '让 agent 的运行记录可恢复、可查询、可审计', en: 'Make agent runs resumable, queryable, and auditable' },
    teaser: {
      zh: 'agent 会跨轮次、调用工具并产生副作用。持久化要回答哪些状态能恢复、哪些记录能查询、哪些事实能审计。',
      en: 'Agents span turns, call tools, and create side effects. Persistence defines what can resume, what can be queried, and what can be audited.',
    },
  },
];

export const stationByNumber = (n: number): Station | undefined =>
  JOURNEY.find((s) => s.station === n);

export const publishedStations = (): Station[] =>
  JOURNEY.filter((s) => s.status === 'published');
