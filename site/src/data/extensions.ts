import type { Lang } from './journey';

export interface ExtensionTopic {
  slug: string;
  title: Record<Lang, string>;
  summary: Record<Lang, string>;
  connection: Record<Lang, string>;
}

// These are reading topics outside the nine-stop journey, not all plugin APIs.
export const EXTENSIONS: ExtensionTopic[] = [
  {
    slug: 'extension-system',
    title: { zh: '扩展机制：能力怎样接入主线', en: 'Extension system: joining the execution path' },
    summary: { zh: '从加载、注册、装配位置到运行证据，理解仓库外模块与宿主之间的契约。', en: 'Follow loading, registration, middleware placement, and evidence across the host boundary.' },
    connection: { zh: '接入第 2–5 站：图装配、工具与中间件', en: 'Joins stops 2–5: assembly, tools, and middleware' },
  },
  {
    slug: 'memory-backends',
    title: { zh: '记忆后端：哪些经验进入下一次请求', en: 'Memory backends: what reaches the next request' },
    summary: { zh: '区分当前对话、压缩摘要和长期记忆，再看 MemoryManager、自动模式与工具模式。', en: 'Separate conversation state, compacted context, and long-term memory; then follow MemoryManager and its modes.' },
    connection: { zh: '接入第 4、5、9 站：上下文、收尾与持久化', en: 'Joins stops 4, 5, and 9: context, finalization, and persistence' },
  },
  {
    slug: 'goals-and-scheduling',
    title: { zh: '长期目标与调度：一次请求怎样延续', en: 'Goals and scheduling: continuing beyond one request' },
    summary: { zh: '区分 goal、一次 run 和定时任务 occurrence，跟随预算、队列、租约与恢复。', en: 'Distinguish a goal, a run, and a scheduled occurrence through budgets, queues, leases, and recovery.' },
    connection: { zh: '接入第 1、5、9 站：启动、终止与恢复', en: 'Joins stops 1, 5, and 9: admission, termination, and recovery' },
  },
];
