// 旅程地图(单一数据源):8 站的卡片元数据,双语。
// 深读正文走 MDX(src/content/tutorials/<lang>/<slug>.mdx),只有 status:'published' 的站才有。
// 这样「地图」是数据、「深读」是内容,各自演化、互不绑架。

export type Lang = 'zh' | 'en';
export type Altitude = '实现' | '架构' | '哲学';
export type Status = 'published' | 'locked';

export interface Station {
  station: number;          // 旅程序号,唯一
  slug: string;             // 对应 MDX 文件名(不含语言),如 02-lead-agent-factory
  risk: number;             // 1..5,改动影响范围
  altitude: Altitude;       // 抽象高度
  status: Status;
  title: Record<Lang, string>;
  mentalModel: Record<Lang, string>;   // 一句话心智模型(卡片核心信息)
  teaser: Record<Lang, string>;        // 一句编辑式「快讯」,与心智模型互补
}

export const JOURNEY: Station[] = [
  {
    station: 1, slug: '01-request-entry', risk: 2, altitude: '实现', status: 'published',
    title: { zh: '请求入口与 Agent 主链', en: 'Request entry and the agent chain' },
    mentalModel: { zh: '一句话怎么变成一次 run', en: 'How a prompt becomes a run' },
    teaser: {
      zh: '模型开口之前，DeerFlow 要先创建 run、装入上下文，并把执行事件持续流回前端。',
      en: 'Before the model speaks, DeerFlow creates a run, installs context, and streams execution events back to the frontend.',
    },
  },
  {
    station: 2, slug: '02-lead-agent-factory', risk: 3, altitude: '架构', status: 'published',
    title: { zh: 'lead-agent 工厂', en: 'Lead-agent factory' },
    mentalModel: { zh: '装配线，不负责思考', en: 'Assembly line, not the brain' },
    teaser: {
      zh: '图工厂不负责推理。它把模型、工具、中间件、prompt 和状态结构装配成一张能运行的图。',
      en: 'The graph factory does not reason; it assembles model, tools, middleware, prompt, and state schema into a runnable graph.',
    },
  },
  {
    station: 3, slug: '03-tools-assembly', risk: 4, altitude: '架构', status: 'published',
    title: { zh: '工具装配', en: 'Tool assembly' },
    mentalModel: { zh: '工具配上了，不代表会暴露给模型', en: 'A configured tool can stay hidden' },
    teaser: {
      zh: '工具列表不是静态注册表。一次 run 会暴露哪些工具，取决于配置、模型能力、沙箱、skill 和 MCP 策略。',
      en: 'A run sees tools through config, model capability, sandbox rules, skills, and MCP policy, not through a static registry.',
    },
  },
  {
    station: 4, slug: '04-middleware-pipeline', risk: 4, altitude: '架构', status: 'published',
    title: { zh: '中间件管线(上)· 请求怎么穿进洋葱', en: 'Middleware pipeline I · inbound through the onion' },
    mentalModel: { zh: '模型开口前，请求先被一层层打点好', en: 'Before the model speaks, the request is dressed layer by layer' },
    teaser: {
      zh: '真正调用模型之前，十来层中间件已经把目录、沙箱、上传、记忆、历史协议全部铺好。这一站走「向内」那半程。',
      en: 'Before a run ever calls the model, a dozen middleware layers prepare directories, sandbox, uploads, memory, and a protocol-clean history. This stop walks the inbound half.',
    },
  },
  {
    station: 5, slug: '05-middleware-return', risk: 5, altitude: '架构', status: 'locked',
    title: { zh: '中间件管线(下)· 回答怎么穿出来', en: 'Middleware pipeline II · the return trip' },
    mentalModel: { zh: '模型开口后，谁先看到回答谁就有权改写', en: 'After it speaks, whoever sees the answer first gets to rewrite it' },
    teaser: {
      zh: '模型开口之后，洋葱开始向外走：安全、循环、子 agent、工具边界、副作用，逆序登场，各有改写权。',
      en: 'Once the model speaks, the onion unwinds outward: safety, loops, subagents, tool boundaries, side effects — in reverse order, each with a say.',
    },
  },
  {
    station: 6, slug: '06-sandbox', risk: 4, altitude: '实现', status: 'locked',
    title: { zh: '沙箱系统', en: 'Sandbox system' },
    mentalModel: { zh: '能力边界，不只是文件系统', en: 'A capability boundary, not a filesystem' },
    teaser: {
      zh: '沙箱不是文件系统包装，而是一道能力边界：它决定 agent 能访问哪些外部资源。',
      en: 'The sandbox is not a filesystem wrapper. It defines which external resources an agent may access.',
    },
  },
  {
    station: 7, slug: '07-subagents', risk: 4, altitude: '架构', status: 'locked',
    title: { zh: '子 agent 系统', en: 'Subagent system' },
    mentalModel: { zh: '委派不是多开一个工具', en: 'Delegation is not another tool' },
    teaser: {
      zh: '在 2.x 里，委派能力通过 task_tool 暴露。能力开关和工具列表耦在一起，这是后续设计需要拆开的地方。',
      en: 'In 2.x, delegation is exposed through task_tool, coupling capability with tool visibility. Later design needs to split those concerns.',
    },
  },
  {
    station: 8, slug: '08-skills', risk: 3, altitude: '架构', status: 'locked',
    title: { zh: '技能系统', en: 'Skill system' },
    mentalModel: { zh: '把最小权限写进工具策略', en: 'Least privilege belongs in tool policy' },
    teaser: {
      zh: 'skill 不只是追加 prompt，还能用 allowed_tools 收敛工具集，把最小权限落到运行时。',
      en: 'A skill does more than append prompt text; allowed_tools narrows the runtime toolset.',
    },
  },
  {
    station: 9, slug: '09-persistence', risk: 3, altitude: '实现', status: 'locked',
    title: { zh: '持久化 · store · checkpointer', en: 'Persistence: store and checkpointer' },
    mentalModel: { zh: 'run 结束后，什么被记住了', en: 'What survives a run' },
    teaser: {
      zh: 'store 与 checkpointer 分工不同：一个存长期状态，一个存可回滚的执行快照。最后一站，看一次 run 结束后留下了什么。',
      en: 'store keeps long-lived state; checkpointer keeps resumable execution snapshots. The last stop asks what remains after completion.',
    },
  },
];

export const stationByNumber = (n: number): Station | undefined =>
  JOURNEY.find((s) => s.station === n);

export const publishedStations = (): Station[] =>
  JOURNEY.filter((s) => s.status === 'published');
