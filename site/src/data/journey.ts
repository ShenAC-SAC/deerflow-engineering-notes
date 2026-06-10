// 旅程地图(单一真相源):8 站的卡片元数据,双语。
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
  mentalModel: Record<Lang, string>;   // 一句话心智模型(卡片主载荷)
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
    mentalModel: { zh: '装配线，不是大脑', en: 'Assembly line, not a mind' },
    teaser: {
      zh: '图工厂不负责推理。它把模型、工具、中间件、prompt 和状态结构装配成一张能运行的图。',
      en: 'The graph factory does not reason; it assembles model, tools, middleware, prompt, and state schema into a runnable graph.',
    },
  },
  {
    station: 3, slug: '03-tools-assembly', risk: 4, altitude: '架构', status: 'published',
    title: { zh: '工具装配', en: 'Tool assembly' },
    mentalModel: { zh: 'list[BaseTool] 不该是唯一真相源', en: 'The tool list is not the truth' },
    teaser: {
      zh: '工具列表不是静态注册表。一次 run 能看见哪些工具，取决于配置、模型能力、沙箱、skill 和 MCP 策略。',
      en: 'A run sees tools through config, model capability, sandbox rules, skills, and MCP policy, not through a static registry.',
    },
  },
  {
    station: 4, slug: '04-middleware-pipeline', risk: 5, altitude: '架构', status: 'locked',
    title: { zh: '中间件管线', en: 'Middleware pipeline' },
    mentalModel: { zh: '顺序即语义', en: 'Order becomes behavior' },
    teaser: {
      zh: '同一组中间件，换个顺序就是另一种 agent。这里要看的，是顺序如何变成运行语义。',
      en: 'The same middleware in a different order yields a different agent. This stop shows how ordering becomes runtime semantics.',
    },
  },
  {
    station: 5, slug: '05-sandbox', risk: 4, altitude: '实现', status: 'locked',
    title: { zh: '沙箱系统', en: 'Sandbox system' },
    mentalModel: { zh: '能力边界，不只是文件系统', en: 'A capability boundary, not a filesystem' },
    teaser: {
      zh: '沙箱不是文件系统包装，而是一道能力边界：它决定 agent 能碰到现实世界的哪一角。',
      en: 'The sandbox is not a filesystem wrapper. It defines which part of the outside world an agent may touch.',
    },
  },
  {
    station: 6, slug: '06-subagents', risk: 4, altitude: '架构', status: 'locked',
    title: { zh: '子 agent 系统', en: 'Subagent system' },
    mentalModel: { zh: '委派不是多开一个工具', en: 'Delegation is not another tool' },
    teaser: {
      zh: '在 2.x 里，委派能力通过 task_tool 暴露。能力开关和工具列表耦在一起，这是后续设计需要拆开的地方。',
      en: 'In 2.x, delegation is exposed through task_tool, coupling capability with tool visibility. Later design needs to split those concerns.',
    },
  },
  {
    station: 7, slug: '07-skills', risk: 3, altitude: '架构', status: 'locked',
    title: { zh: '技能系统', en: 'Skill system' },
    mentalModel: { zh: '把最小权限写进工具策略', en: 'Least privilege belongs in tool policy' },
    teaser: {
      zh: 'skill 不只是追加 prompt，还能用 allowed_tools 收窄工具集，把最小权限落到运行时。',
      en: 'A skill does more than append prompt text; allowed_tools narrows the runtime toolset.',
    },
  },
  {
    station: 8, slug: '08-persistence', risk: 3, altitude: '实现', status: 'locked',
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
