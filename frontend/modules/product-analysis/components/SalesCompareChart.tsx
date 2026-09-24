import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useProductAnalysisStrings } from '../i18n';
import { formatMoney } from '../utils/format';
import { usePaTheme } from '../themeContext';
import { RANKING_TOP_N } from './ProductRanking';
import { selectTopProductsBySales } from '../utils/topProducts';
import type { AggregatedItem } from '../types';

const TOP_N = RANKING_TOP_N;

interface SalesCompareChartProps {
  items: AggregatedItem[];
  currency: string;
  /** 点击柱条打开商品详情 */
  onSelect?: (item: AggregatedItem) => void;
}

export interface SalesCompareRow {
  id: string;
  name: string;
  rank: number;
  ordered: number | null;
  confirmed: number | null;
  item: AggregatedItem;
}

/** 与商品排行榜共用 utils/topProducts 的同一份 Top N / 排序：图表与排行逐条对应的数据源 */
export function buildSalesCompareRows(items: AggregatedItem[]): SalesCompareRow[] {
  return selectTopProductsBySales(items, TOP_N).map(({ rank, item, salesOrdered, salesConfirmed }) => ({
    id: item.itemId,
    name: item.itemName,
    rank,
    ordered: salesOrdered,
    confirmed: salesConfirmed,
    item,
  }));
}

/** Y 轴刻度只显示排名（#1…#6）：商品名普遍较长且前缀重复，截断后不可分辨；
 *  完整名称由下方排行榜与悬浮提示展示。 */
export function salesCompareTick(row: Pick<SalesCompareRow, 'rank'>): string {
  return `#${row.rank}`;
}

/** 商品销售对比：与排行榜同一 Top N / 同一排序（销售额·已下 降序），
 *  Y 轴以「#排名」标注，可与下方商品排行榜逐条对应。 */
export const SalesCompareChart: React.FC<SalesCompareChartProps> = ({ items, currency, onSelect }) => {
  const strings = useProductAnalysisStrings();
  const { theme } = usePaTheme();
  const { primary, secondary } = theme.chart;

  const rows: SalesCompareRow[] = React.useMemo(() => buildSalesCompareRows(items), [items]);

  const nameTick = (id: string) => {
    const row = rows.find((entry) => entry.id === id);
    return row ? salesCompareTick(row) : id;
  };

  const compactTick = (value: number) =>
    new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  const legends = [
    { key: 'ordered' as const, label: strings.summary.salesOrdered, color: primary },
    { key: 'confirmed' as const, label: strings.summary.salesConfirmed, color: secondary },
  ];

  return (
    <section className="pa-card pa-sales-chart" aria-label={strings.overview.salesCompare}>
      <div className="pa-card-head">
        <h3 className="pa-card-title">{strings.overview.salesCompare}</h3>
        <span className="pa-card-sub">
          {strings.overview.salesCompareHint.replace('{n}', String(rows.length))}
        </span>
        <div className="pa-legend-chips">
          {legends.map(({ key, label, color }) => (
            <span key={key} className="pa-legend-chip">
              <i style={{ backgroundColor: color }} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="pa-chart-empty" role="status">{strings.overview.noSalesData}</div>
      ) : (
        <div className="pa-comparison-canvas" style={{ height: Math.max(220, rows.length * 44 + 36) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--pa-card-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={compactTick} />
              <YAxis
                type="category"
                dataKey="id"
                width={44}
                tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--text-secondary)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={nameTick}
              />
              <Tooltip
                cursor={{ fill: 'var(--pa-accent-soft)' }}
                content={({ active, label }) => {
                  if (!active || label == null) return null;
                  const row = rows.find((entry) => entry.id === String(label));
                  if (!row) return null;
                  return (
                    <div className="pa-chart-tooltip">
                      <p className="font-semibold mb-1">#{row.rank} {row.name}</p>
                      {legends.map(({ key, label: text, color }) => {
                        const value = row[key];
                        return (
                          <p key={key} className="flex items-center justify-between gap-4">
                            <span>
                              <span aria-hidden="true" style={{ color }}>● </span>
                              {text}
                            </span>
                            <span className="font-mono font-semibold">{formatMoney(value, currency)}</span>
                          </p>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="ordered"
                name={strings.summary.salesOrdered}
                fill={primary}
                maxBarSize={14}
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
                cursor={onSelect ? 'pointer' : undefined}
                onClick={(data: { id?: unknown }) => {
                  const row = rows.find((entry) => entry.id === data?.id);
                  if (row && onSelect) onSelect(row.item);
                }}
              />
              <Bar
                dataKey="confirmed"
                name={strings.summary.salesConfirmed}
                fill={secondary}
                maxBarSize={14}
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
                cursor={onSelect ? 'pointer' : undefined}
                onClick={(data: { id?: unknown }) => {
                  const row = rows.find((entry) => entry.id === data?.id);
                  if (row && onSelect) onSelect(row.item);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
