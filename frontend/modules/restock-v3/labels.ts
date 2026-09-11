/** 补货工作台展示工具：状态文案（文字+颜色双通道）、数字格式化 */
import type { RestockStatus, SalesQualityStatus, MatchType, InboundBreakdownEntry } from './types';

export const formatNumber = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined) return '未知';
  if (!Number.isFinite(value)) return '未知';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
};

export const formatInt = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '未知';
  return Math.round(value).toLocaleString('zh-CN');
};

export const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '未知';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

export const RESTOCK_STATUS_META: Record<RestockStatus, StatusMeta> = {
  critical: { label: '断货风险', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.1)' },
  warning: { label: '需补货', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)' },
  no_stock_data: { label: '库存未知', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' },
  missing_sales: { label: '无有效销量', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  zero_sales: { label: '零销量', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  healthy: { label: '库存充足', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)' },
};

export const QUALITY_LABELS: Record<SalesQualityStatus, string> = {
  ok: '数据正常',
  insufficient: '观测不足（受限估算）',
  stale: '数据过旧',
  zero: '真实零销量',
  no_data: '无有效观测',
};

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  'shop-mapping': '店铺映射',
  'exact-yc': '元仓同码直连',
  'site-mapping': '站点映射',
  'self-inventory': '本地SKU一致',
};

export const SKU_SOURCE_LABELS: Record<string, string> = {
  modelCode: '规格货号',
  variationSku: '规格编号',
  item: '商品编号',
};

export const INBOUND_CATEGORY_LABELS: Record<InboundBreakdownEntry['category'], string> = {
  beforeArrival: '到仓前到货（计入）',
  duringCoverage: '覆盖期内到货（计入）',
  afterCoverage: '覆盖期后到货（不计入）',
  noEta: '无ETA（不计入）',
  overdue: 'ETA已逾期（不计入）',
};

export const RULE_SOURCE_LABELS: Record<string, string> = {
  'sku-rule': 'SKU 规则',
  global: '全局参数',
  inventory: '库存档案',
};
