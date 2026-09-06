export const MAX_PROMPT_CONTEXT_CHARS = 24_000;

/** 商品指标字段 → 注入 prompt 的中文标签（键名与前端 excelParser 输出一致） */
export const METRIC_LABELS: Record<string, string> = {
  status: '商品状态',
  modelId: '全球商品货号',
  createdAt: '创建日期',
  createdDays: '上架天数',
  currentPrice: '当前价格',
  priceFlag: '价格竞争力标记',
  salesOrdered: '销售额-已下订单',
  salesConfirmed: '销售额-已确认订单',
  impressions: '商品展示量',
  clicks: '商品点击量',
  ctr: '点击率%',
  cvrOrdered: '订单转化率%-已下订单',
  cvrConfirmed: '订单转化率%-已确认订单',
  ordersOrdered: '已下订单数',
  ordersConfirmed: '已确定订单数',
  unitsOrdered: '售出件数-已下订单',
  unitsConfirmed: '售出件数-已确认订单',
  buyersOrdered: '买家数-已下订单',
  buyersConfirmed: '买家数-已确认订单',
  cvrVisitorsOrdered: '访客转化率%-已下订单',
  cvrVisitorsConfirmed: '访客转化率%-已确认订单',
  aovOrdered: '每笔订单销售额-已下订单',
  aovConfirmed: '每笔订单销售额-已确认订单',
  uniqueImpressions: '不重复曝光量',
  uniqueClicks: '不重复点击量',
  visitors: '商品访客数',
  pageViews: '商品页面访问量',
  bounceVisitors: '跳出商品页面的访客数',
  bounceRate: '商品跳出率%',
  searchClicks: '搜索点击人数',
  likes: '点赞数',
  cartVisitors: '加购访客数',
  cartUnits: '加购件数',
  cartRate: '加购率%',
  repeatOrderRate: '重复下单率%',
  repurchaseRateConfirmed: '订单复购率%-已确认订单',
  avgReorderDays: '平均重复下单天数',
  avgRepurchaseDays: '订单复购平均天数-已确认订单',
};

const VARIATION_KEYS: { key: string; label: string }[] = [
  { key: 'variationName', label: '规格名称' },
  { key: 'variationSku', label: '规格编号' },
  { key: 'variationStatus', label: '状态' },
  { key: 'unitsOrdered', label: '件数-已下' },
  { key: 'unitsConfirmed', label: '件数-已确认' },
  { key: 'buyersOrdered', label: '买家数-已下' },
  { key: 'cartUnits', label: '加购件数' },
];

const MAX_VARIATIONS_IN_PROMPT = 20;
const MAX_OVERVIEW_ITEMS = 20;
const ITEM_NAME_SNIPPET_LENGTH = 60;

export interface ShopPromptScope {
  shopName: string;
  site: string;
  currency: string;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  days: number;
  mode: 'item' | 'overview';
}

export function buildShopAnalysisSystemPrompt(scope: ShopPromptScope): string {
  const target =
    scope.mode === 'item' ? '当前单个商品（含日趋势与全部变体）' : '整店区间汇总数据';
  return [
    '你是一名资深跨境电商（Shopee）运营数据分析师。',
    `分析对象：${target}。`,
    `店铺「${scope.shopName}」（站点 ${scope.site}），统计区间 ${scope.from} 至 ${scope.to}（覆盖 ${scope.days} 个数据日），币种 ${scope.currency}。`,
    '数据口径：数据来自店铺每日导出快照的区间聚合——访客/订单/件数/销售额等为区间求和；转化率/点击率/加购率等统一为访客或展示口径（订单÷访客、点击÷曝光、加购访客÷访客）；标签含 % 的字段值为百分数数值（7.05 代表 7.05%）；「已下订单」指用户提交的订单，「已确认订单」指平台确认的有效订单；缺失字段表示原始报表中无该数据。',
    '回答要求：',
    '1. 用中文回答，精炼分点（编号列表），总长不超过 800 字，关键数字用反引号包裹。',
    '2. 只基于给定数据做定量分析，禁止编造数据中不存在的数字；数据不足时明确指出。',
    '3. 诊断问题后必须给出可执行建议（覆盖主图/标题关键词/价格/变体结构/加购转化/广告投放等维度中的相关项）。',
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function serializeMetrics(item: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const value = item[key];
    if (value === null || value === undefined || value === '') continue;
    lines.push(`- ${label}: ${formatMetricValue(value)}`);
  }
  return lines;
}

function serializeVariations(item: Record<string, unknown>): string[] {
  const variations = item.variations;
  if (!Array.isArray(variations) || variations.length === 0) return [];
  const rows = variations.filter(isRecord);
  const sorted = [...rows].sort(
    (a, b) => (typeof b.unitsOrdered === 'number' ? b.unitsOrdered : 0) -
      (typeof a.unitsOrdered === 'number' ? a.unitsOrdered : 0)
  );
  const truncated = sorted.slice(0, MAX_VARIATIONS_IN_PROMPT);
  const lines = truncated.map((variation, index) => {
    const parts = VARIATION_KEYS.map(({ key, label }) => {
      const value = variation[key];
      if (value === null || value === undefined || value === '') return null;
      return `${label}: ${formatMetricValue(value)}`;
    }).filter((part): part is string => part !== null);
    const name = typeof variation.variationName === 'string'
      ? variation.variationName.slice(0, ITEM_NAME_SNIPPET_LENGTH)
      : `变体#${index + 1}`;
    return `  ${index + 1}. [${name}] ${parts.join(' | ')}`;
  });
  if (sorted.length > MAX_VARIATIONS_IN_PROMPT) {
    lines.push(`  （仅列出件数前 ${MAX_VARIATIONS_IN_PROMPT} 个变体，共 ${sorted.length} 个）`);
  }
  return [`变体明细（区间合并，按已下件数降序，共 ${rows.length} 个）:`, ...lines];
}

function truncate(text: string): string {
  return text.length > MAX_PROMPT_CONTEXT_CHARS
    ? `${text.slice(0, MAX_PROMPT_CONTEXT_CHARS)}\n（数据过长已截断）`
    : text;
}

function numOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface DailySeriesLike {
  date: string;
  ordersOrdered: number;
  visitors: number;
  cvrConfirmed: number | null;
}

/** 序列化单品聚合（含日趋势与变体）注入 prompt */
export function serializeAggregatedItem(
  item: Record<string, unknown>,
  series: DailySeriesLike[],
  variations: unknown
): string {
  const name = typeof item.itemName === 'string' ? item.itemName : '';
  const lines = [
    `商品编号: ${String(item.itemId ?? '')}`,
    `商品标题: ${name.slice(0, ITEM_NAME_SNIPPET_LENGTH)}`,
    `覆盖天数: ${String(item.days ?? series.length)}`,
    ...serializeMetrics(item),
  ];
  if (series.length > 0) {
    lines.push(
      '日趋势（日期: 已下订单 | 访客 | 访客转化率%）:',
      ...series.map(
        (point) =>
          `  ${point.date}: ${point.ordersOrdered} | ${point.visitors} | ${point.cvrConfirmed === null ? '—' : point.cvrConfirmed.toFixed(2)}`
      )
    );
  }
  lines.push(...serializeVariations({ variations }));
  return truncate(lines.join('\n'));
}

/** 序列化整店区间概览：各类别汇总 + 销售额 Top 商品 */
export function serializeAggregatedOverview(
  sheets: { sheetKey: string; items: Record<string, unknown>[] }[]
): string {
  const sections: string[] = [];
  for (const sheet of sheets) {
    const items = sheet.items;
    if (items.length === 0) continue;
    const totals = items.reduce<{ salesOrdered: number; ordersOrdered: number; visitors: number; clicks: number }>(
      (acc, item) => ({
        salesOrdered: acc.salesOrdered + numOrZero(item.salesOrdered),
        ordersOrdered: acc.ordersOrdered + numOrZero(item.ordersOrdered),
        visitors: acc.visitors + numOrZero(item.visitors),
        clicks: acc.clicks + numOrZero(item.clicks),
      }),
      { salesOrdered: 0, ordersOrdered: 0, visitors: 0, clicks: 0 }
    );
    sections.push(
      `【类别 ${sheet.sheetKey}】商品数 ${items.length} | 总销售额(已下) ${totals.salesOrdered.toFixed(2)} | ` +
      `总订单(已下) ${totals.ordersOrdered} | 总访客 ${totals.visitors} | 总点击 ${totals.clicks}`
    );
    const top = [...items]
      .sort((a, b) => numOrZero(b.salesOrdered) - numOrZero(a.salesOrdered))
      .slice(0, MAX_OVERVIEW_ITEMS);
    const topLines = top.map((item, index) => {
      const name = typeof item.itemName === 'string' ? item.itemName : '';
      return `  ${index + 1}. ${String(item.itemId ?? '?')} 「${name.slice(0, ITEM_NAME_SNIPPET_LENGTH)}」` +
        ` 销售额 ${numOrZero(item.salesOrdered).toFixed(2)} | 订单 ${numOrZero(item.ordersOrdered)} | ` +
        `转化率% ${numOrZero(item.cvrConfirmed).toFixed(2)} | 点击率% ${numOrZero(item.ctr).toFixed(2)} | ` +
        `访客 ${numOrZero(item.visitors)}`;
    });
    sections.push(`销售额 Top ${top.length}:\n${topLines.join('\n')}`);
  }
  return truncate(sections.join('\n\n'));
}
