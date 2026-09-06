import React from 'react';
import { Package, DollarSign, ShoppingCart, Users, Percent } from 'lucide-react';
import { formatCount, formatMoney, formatPercent, type SheetSummary } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';

interface SummaryCardsProps {
  summary: SheetSummary;
  currency: string;
}

/** 报告级 KPI 卡 ×6 */
export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, currency }) => {
  const strings = useProductAnalysisStrings();
  const cards = [
    { icon: Package, label: strings.summary.itemCount, value: formatCount(summary.itemCount) },
    { icon: DollarSign, label: strings.summary.salesOrdered, value: formatMoney(summary.totalSalesOrdered, currency) },
    { icon: DollarSign, label: strings.summary.salesConfirmed, value: formatMoney(summary.totalSalesConfirmed, currency) },
    { icon: ShoppingCart, label: strings.summary.orders, value: formatCount(summary.totalOrders) },
    { icon: Users, label: strings.summary.visitors, value: formatCount(summary.totalVisitors) },
    { icon: Percent, label: strings.summary.weightedCvr, value: formatPercent(summary.weightedCvr) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="rounded-2xl border p-3.5 min-w-0"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <Icon size={14} />
            <span className="text-xs font-medium truncate">{label}</span>
          </div>
          <p className="text-base font-bold mt-1.5 truncate" style={{ color: 'var(--text-primary)' }} title={value}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
};
