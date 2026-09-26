const baseUrl = () => {
  const raw = process.env.COLLECTOR_PRIVATE_URL || '';
  const url = new URL(raw);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('COLLECTOR_PRIVATE_URL 配置无效');
  }
  return url.origin;
};

export async function collectorRequest<T>(path: string, options: {method?: string; body?: unknown} = {}): Promise<T> {
  const token = process.env.COLLECTOR_SERVICE_TOKEN;
  if (!token) throw new Error('COLLECTOR_SERVICE_TOKEN 未配置');
  if (!path.startsWith('/api/erp/')) throw new Error('仅允许调用采集器 ERP 私网接口');
  const response = await fetch(baseUrl() + path, {
    method: options.method ?? 'GET',
    headers: {Authorization:`Bearer ${token}`, ...(options.body === undefined ? {} : {'Content-Type':'application/json'})},
    ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)}),
    signal:AbortSignal.timeout(30_000),
  });
  const data = await response.json() as T & {error?:string};
  if (!response.ok) throw Object.assign(new Error(data.error || `采集器返回 HTTP ${response.status}`),{status:response.status});
  return data;
}
