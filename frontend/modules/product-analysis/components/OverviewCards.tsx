import React from 'react';
import { DollarSign, Package, Percent, ShoppingCart, Users } from 'lucide-react';
import { formatCount, formatMoney, formatPercent, type SheetSummary } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { SheetEffectiveSummary } from '../types';

interface OverviewCardsProps {
  summary: SheetSummary;
  currency: string;
  effectiveSummary: SheetEffectiveSummary | null;
}

/** 概览六项核心指标。加权转化率直接使用后端成对样本结果。 */
export const OverviewCards: React.FC<OverviewCardsProps> = ({ summary, currency, effectiveSummary }) => {
  const strings = useProductAnalysisStrings();
  const cards = [
    { icon: Package, label: strings.summary.itemCount, value: formatCount(summary.itemCount), title: undefined },
    { icon: Users, label: strings.summary.visitors, value: formatCount(summary.totalVisitors), title: undefined },
    { icon: ShoppingCart, label: strings.summary.orders, value: formatCount(summary.totalOrders), title: undefined },
    { icon: DollarSign, label: strings.summary.salesOrdered, value: formatMoney(summary.totalSalesOrdered, currency), title: undefined },
    { icon: DollarSign, label: strings.summary.salesConfirmed, value: formatMoney(summary.totalSalesConfirmed, currency), title: undefined },
    { icon: Percent, label: strings.summary.weightedCvr, value: formatPercent(effectiveSummary?.weightedCvr ?? null), title: strings.summary.cvrNote },
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
