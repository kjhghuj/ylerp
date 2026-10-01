// 环境地址统一配置；修改后重新构建以更新域名权限。
export const ERP_API_BASE = 'http://localhost:4022/api';
export const ERP_PRODUCTION_API_BASE = 'http://39.97.246.43/api';
export const ERP_ENVIRONMENTS = {
  development: {label: '开发环境', apiBase: ERP_API_BASE},
  production: {label: '生产环境', apiBase: ERP_PRODUCTION_API_BASE},
};
export const REQUEST_TIMEOUT_MS = 15_000;
export const CAPTURE_TTL_MS = 30 * 60_000;

export function normalizeApiBase(input) {
  const url = new URL(input);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const configuredProduction = url.origin === new URL(ERP_PRODUCTION_API_BASE).origin;
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && (local || configuredProduction))) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('ERP 地址须为 HTTPS，或已配置的开发、生产 HTTP 地址，且不能包含账号或参数。');
  }
  return url.href.replace(/\/+$/, '');
}
