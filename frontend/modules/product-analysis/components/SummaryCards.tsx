import React from 'react';
import { Package, DollarSign, ShoppingCart, Users, Percent } from 'lucide-react';
import { formatCount, formatMoney, formatPercent, type SheetSummary } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';

interface SummaryCardsProps {
  summary: SheetSummary;
  currency: string;
  /** 加权转化率（后端按订单×访客同日有效的成对样本计算；null = 无有效样本，显示「—」） */
  weightedCvr: number | null;
}

/** 列表视图报告级 KPI 卡 ×6（概览视图使用 OverviewCards） */
export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, currency, weightedCvr }) => {
  const strings = useProductAnalysisStrings();
  const cards = [
    { icon: Package, label: strings.summary.itemCount, value: formatCount(summary.itemCount), title: undefined },
    { icon: DollarSign, label: strings.summary.salesOrdered, value: formatMoney(summary.totalSalesOrdered, currency), title: undefined },
    { icon: DollarSign, label: strings.summary.salesConfirmed, value: formatMoney(summary.totalSalesConfirmed, currency), title: undefined },
    { icon: ShoppingCart, label: strings.summary.orders, value: formatCount(summary.totalOrders), title: undefined },
    { icon: Users, label: strings.summary.visitors, value: formatCount(summary.totalVisitors), title: undefined },
    { icon: Percent, label: strings.summary.weightedCvr, value: formatPercent(weightedCvr), title: strings.summary.cvrNote },
  ];
  return (
    <div className="pa-summary grid gap-3">
      {cards.map(({ icon: Icon, label, value, title }) => (
        <div
          key={label}
          className="pa-card pa-metric-card"
          title={title}
        >
          <div className="pa-metric-head">
            <span className="pa-metric-icon">
              <Icon size={15} />
            </span>
            <span className="pa-metric-label">{label}</span>
          </div>
          <p className="pa-metric-value" title={value}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
};
