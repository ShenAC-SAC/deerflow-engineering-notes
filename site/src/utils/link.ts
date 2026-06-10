// 站内链接统一加 base 前缀。
// GitHub Pages 项目页部署在子路径(/deerflow-engineering-notes/),
// Astro 不会自动给模板里硬编码的 href 加 base,必须显式过这个助手。
// 本地 / 根部署时 base 为 '/',此函数对结果无副作用。
const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // -> '/deerflow-engineering-notes' 或 ''

export const link = (path: string): string =>
  BASE + (path.startsWith('/') ? path : `/${path}`);

// 把带 base 的运行时 pathname 还原成不含 base 的站内路径(语言切换用)。
export const stripBase = (pathname: string): string =>
  BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
