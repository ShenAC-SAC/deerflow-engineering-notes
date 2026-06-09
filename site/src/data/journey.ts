// 旅程地图(单一真相源):8 站的卡片元数据,双语。
// 深读正文走 MDX(src/content/tutorials/<lang>/<slug>.mdx),只有 status:'published' 的站才有。
// 这样「地图」是数据、「深读」是内容,各自演化、互不绑架。

export type Lang = 'zh' | 'en';
export type Altitude = '实现' | '架构' | '哲学';
export type Status = 'published' | 'locked';

export interface Station {
  station: number;          // 旅程序号,唯一
  slug: string;             // 对应 MDX 文件名(不含语言),如 02-lead-agent-factory
  risk: number;             // 1..5,碰它会炸什么
  altitude: Altitude;       // 抽象高度
  status: Status;
  title: Record<Lang, string>;
  mentalModel: Record<Lang, string>;
}

export const JOURNEY: Station[] = [
  {
    station: 1, slug: '01-request-entry', risk: 2, altitude: '实现', status: 'locked',
    title: { zh: '请求入口与 agent 主链', en: 'Request entry & the agent main chain' },
    mentalModel: { zh: '一句话怎么变成一次 run', en: 'How one sentence becomes a run' },
  },
  {
    station: 2, slug: '02-lead-agent-factory', risk: 3, altitude: '架构', status: 'published',
    title: { zh: 'lead-agent 工厂', en: 'The lead-agent factory' },
    mentalModel: { zh: '装配线,不是大脑', en: 'An assembly line, not a brain' },
  },
  {
    station: 3, slug: '03-tools-assembly', risk: 4, altitude: '架构', status: 'locked',
    title: { zh: '工具装配', en: 'Tools assembly' },
    mentalModel: { zh: 'list[BaseTool] 不该是唯一真相源', en: 'list[BaseTool] is not the only source of truth' },
  },
  {
    station: 4, slug: '04-middleware-pipeline', risk: 5, altitude: '架构', status: 'locked',
    title: { zh: '中间件管线', en: 'The middleware pipeline' },
    mentalModel: { zh: '顺序即语义', en: 'Order is semantics' },
  },
  {
    station: 5, slug: '05-sandbox', risk: 4, altitude: '实现', status: 'locked',
    title: { zh: '沙箱系统', en: 'The sandbox system' },
    mentalModel: { zh: '待解锁', en: 'Coming soon' },
  },
  {
    station: 6, slug: '06-subagents', risk: 4, altitude: '架构', status: 'locked',
    title: { zh: '子 agent 系统', en: 'The subagent system' },
    mentalModel: { zh: '待解锁', en: 'Coming soon' },
  },
  {
    station: 7, slug: '07-skills', risk: 3, altitude: '架构', status: 'locked',
    title: { zh: '技能系统', en: 'The skills system' },
    mentalModel: { zh: '待解锁', en: 'Coming soon' },
  },
  {
    station: 8, slug: '08-persistence', risk: 3, altitude: '实现', status: 'locked',
    title: { zh: '持久化 · store · checkpointer', en: 'Persistence · store · checkpointer' },
    mentalModel: { zh: '待解锁', en: 'Coming soon' },
  },
];

export const stationByNumber = (n: number): Station | undefined =>
  JOURNEY.find((s) => s.station === n);

export const publishedStations = (): Station[] =>
  JOURNEY.filter((s) => s.status === 'published');
