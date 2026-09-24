import React from 'react';
import { DollarSign, Package, Percent, ShoppingCart, Users } from 'lucide-react';
import { formatCount, formatMoney, formatPercent, type SheetSummary } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { SheetEffectiveSummary } from '../types';

interface OverviewCardsProps {
  summary: SheetSummary;
  currency: string;
  /** 加权转化率（后端按订单×访客同日有效的成对样本计算；null = 无有效样本，显示「—」） */
  weightedCvr: number | null;
}

/** 概览五项核心指标，跨整行展示，避免金额在侧栏内被截断。 */
export const OverviewCards: React.FC<Omit<OverviewCardsProps, 'weightedCvr'>> = ({ summary, currency }) => {
  const strings = useProductAnalysisStrings();
  const cards = [
    { icon: Package, label: strings.summary.itemCount, value: formatCount(summary.itemCount), title: undefined },
    { icon: Users, label: strings.summary.visitors, value: formatCount(summary.totalVisitors), title: undefined },
    { icon: ShoppingCart, label: strings.summary.orders, value: formatCount(summary.totalOrders), title: undefined },
    { icon: DollarSign, label: strings.summary.salesOrdered, value: formatMoney(summary.totalSalesOrdered, currency), title: undefined },
    { icon: DollarSign, label: strings.summary.salesConfirmed, value: formatMoney(summary.totalSalesConfirmed, currency), title: undefined },
  ];
  return (
    <div className="pa-ov-metrics">
      {cards.map(({ icon: Icon, label, value, title }, index) => (
        <div key={label} className={`pa-card pa-metric-card${index === 0 ? ' pa-metric-featured' : ''}`} title={title}>
          <div className="pa-metric-head">
            <span className="pa-metric-icon">
              <Icon size={17} />
            </span>
            <span className="pa-metric-label">{label}</span>
          </div>
          <p className="pa-metric-value" title={value}>{value}</p>
        </div>
      ))}
    </div>
  );
};

/** 加权转化率卡：环形进度 + 大号百分比 + 后端返回的成对样本口径说明。
 *  数值直接使用后端 weightedCvr，绝不以总订单 ÷ 总访客重算；null 显示「—」且不画进度弧。
 *  DOM 契约：标签 span 所在 div 的父节点内第一个 <p> 是转化率数值（验收测试依赖）。 */
export function WeightedCvrCard({ summary }: { summary: SheetEffectiveSummary | null }) {
  const strings = useProductAnalysisStrings();
  const value = summary?.weightedCvr ?? null;
  const clamped = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const arc = clamped === null ? 0 : (clamped / 100) * circumference;
  const hasSample = summary?.weightedCvrNumerator != null && summary?.weightedCvrDenominator != null;
  return (
    <div className="pa-card pa-cvr-card" title={strings.summary.cvrNote}>
      <div className="pa-cvr-head">
        <span className="pa-metric-icon">
          <Percent size={15} />
        </span>
        <span className="pa-metric-label">{strings.summary.weightedCvr}</span>
      </div>
      <div className="pa-cvr-body">
        <div className="pa-cvr-ring" aria-hidden="true">
          <svg viewBox="0 0 70 70">
            <circle cx="35" cy="35" r={radius} fill="none" stroke="var(--pa-accent-soft-2)" strokeWidth="8" />
            {clamped !== null && (
              <circle
                cx="35"
                cy="35"
                r={radius}
                fill="none"
                stroke="var(--pa-accent-ui)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${arc} ${circumference - arc}`}
              />
            )}
          </svg>
        </div>
        <div className="min-w-0">
          <p className="pa-cvr-big">{formatPercent(value)}</p>
          <span className="pa-cvr-sample">
            {hasSample
              ? strings.summary.cvrSample
                  .replace('{orders}', formatCount(summary.weightedCvrNumerator))
                  .replace('{visitors}', formatCount(summary.weightedCvrDenominator))
              : strings.summary.cvrSampleEmpty}
          </span>
        </div>
      </div>
    </div>
  );
}
