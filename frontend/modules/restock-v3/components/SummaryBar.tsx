/** 紧凑结果摘要：一行可点击指标，点击筛选主表（不占首屏的装饰卡片） */
import type { ComputeResult } from '../types';
import { formatInt, formatMoney } from '../labels';

export type TableFilter = 'restock' | 'critical' | 'unknown' | 'all';

interface SummaryBarProps {
  result: ComputeResult;
  filter: TableFilter;
  onFilterChange: (filter: TableFilter) => void;
}

export default function SummaryBar({ result, filter, onFilterChange }: SummaryBarProps) {
  const { summary } = result;
  const metrics: Array<{ key: TableFilter | null; label: string; value: string; color: string }> = [
    { key: 'restock', label: '需补货 SKU', value: formatInt(summary.restockCount), color: '#d97706' },
    { key: null, label: '建议总量', value: formatInt(summary.totalSuggestedQty), color: 'var(--text-primary)' },
    { key: 'critical', label: '断货风险', value: formatInt(summary.criticalCount), color: '#dc2626' },
    { key: 'unknown', label: '库存未知', value: formatInt(summary.noStockDataCount), color: '#7c3aed' },
    { key: null, label: '零销量', value: formatInt(summary.zeroSalesCount), color: '#64748b' },
    { key: null, label: '估算金额', value: summary.estimatedCostKnownSkus > 0 ? formatMoney(summary.estimatedCost) : '未知', color: 'var(--text-secondary)' },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-[13px]"
      style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)' }}
    >
      {metrics.map((metric, index) => {
        const content = (
          <>
            <span style={{ color: 'var(--text-tertiary)' }}>{metric.label}</span>
            <span className="font-semibold tabular-nums ml-1" style={{ color: metric.color }}>{metric.value}</span>
          </>
        );
        if (metric.key === null) {
          return <span key={index} className="flex items-center">{content}</span>;
        }
        return (
          <button
            key={index}
            type="button"
            onClick={() => onFilterChange(metric.key)}
            aria-pressed={filter === metric.key}
            className="flex items-center rounded-md px-1.5 py-0.5 transition-colors"
            style={filter === metric.key ? { backgroundColor: 'var(--bg-primary)', outline: '1px solid var(--border-light)' } : undefined}
          >
            {content}
          </button>
        );
      })}
      <span className="flex-1" />
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }} title="建议总量只统计可执行建议；库存未知与无有效销量的 SKU 计 0，不混入统计">
        共 {summary.totalProducts} 个 SKU · 统计口径：{result.metadata.salesMetricLabel ?? '已下订单件数'}
        {result.metadata.statisticsDays !== null && ` ÷ ${result.metadata.statisticsDays} 天`}
        {result.metadata.statisticsDaysOverridden && '（人工覆盖）'}
      </span>
    </div>
  );
}
