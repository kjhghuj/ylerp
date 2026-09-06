import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ConversionFunnelChart } from '../components/charts/ConversionFunnelChart';
import { VariationUnitsChart } from '../components/charts/VariationUnitsChart';
import { OrderStatusCompareChart } from '../components/charts/OrderStatusCompareChart';
import { KeyRatioBars } from '../components/KeyRatioBars';
import { VariationTable } from '../components/VariationTable';
import { AiChatPanel } from './AiChatPanel';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { ParentProduct, ReportDetail, SheetKey } from '../types';

type ModalTab = 'overview' | 'charts' | 'variations' | 'ai';
const MODAL_TABS: { key: ModalTab; labelKey: 'tabOverview' | 'tabCharts' | 'tabVariations' | 'tabAi' }[] = [
  { key: 'overview', labelKey: 'tabOverview' },
  { key: 'charts', labelKey: 'tabCharts' },
  { key: 'variations', labelKey: 'tabVariations' },
  { key: 'ai', labelKey: 'tabAi' },
];

interface ProductDetailModalProps {
  item: ParentProduct;
  report: ReportDetail;
  sheetKey: SheetKey;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ item, report, sheetKey, onClose }) => {
  const strings = useProductAnalysisStrings();
  const [activeTab, setActiveTab] = useState<ModalTab>('overview');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold line-clamp-2 leading-5" style={{ color: 'var(--text-primary)' }} title={item.itemName}>
                {item.itemName}
              </p>
              <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                #{item.itemId}
                {item.status ? ` · ${item.status}` : ''}
                {` · ${report.currency}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg shrink-0 transition-colors duration-200"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-1 mt-3">
            {MODAL_TABS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200"
                style={{
                  backgroundColor: activeTab === key ? 'var(--primary)' : 'transparent',
                  color: activeTab === key ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {strings.modal[labelKey]}
              </button>
            ))}
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {activeTab === 'overview' && <OverviewTab item={item} currency={report.currency} />}
          {activeTab === 'charts' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ConversionFunnelChart item={item} />
                <OrderStatusCompareChart item={item} />
              </div>
              <KeyRatioBars item={item} />
            </div>
          )}
          {activeTab === 'variations' && (
            <div className="flex flex-col gap-4">
              <VariationUnitsChart variations={item.variations} />
              <VariationTable variations={item.variations} />
            </div>
          )}
          {activeTab === 'ai' && <AiChatPanel reportId={report.id} sheetKey={sheetKey} item={item} />}
        </div>
      </div>
    </div>
  );
};

interface MetricEntry {
  label: string;
  value: string;
}

function OverviewTab({ item, currency }: { item: ParentProduct; currency: string }) {
  const strings = useProductAnalysisStrings();
  const percent = (label: string, value: number | null): MetricEntry => ({ label, value: formatPercent(value) });
  const count = (label: string, value: number | null): MetricEntry => ({ label, value: formatCount(value) });
  const money = (label: string, value: number | null): MetricEntry => ({ label, value: formatMoney(value, currency) });
  const metrics = strings.metrics;

  const groups: { title: string; entries: MetricEntry[] }[] = [
    {
      title: strings.groupSales,
      entries: [
        money(metrics.salesOrdered, item.salesOrdered),
        money(metrics.salesConfirmed, item.salesConfirmed),
        money(metrics.aovOrdered, item.aovOrdered),
        money(metrics.aovConfirmed, item.aovConfirmed),
        ...(item.currentPrice !== null && item.currentPrice !== undefined
          ? [money(metrics.currentPrice, item.currentPrice)]
          : []),
      ],
    },
    {
      title: strings.groupTraffic,
      entries: [
        count(metrics.impressions, item.impressions),
        count(metrics.clicks, item.clicks),
        count(metrics.uniqueImpressions, item.uniqueImpressions),
        count(metrics.uniqueClicks, item.uniqueClicks),
        count(metrics.visitors, item.visitors),
        count(metrics.pageViews, item.pageViews),
        count(metrics.bounceVisitors, item.bounceVisitors),
        count(metrics.searchClicks, item.searchClicks),
        count(metrics.likes, item.likes),
      ],
    },
    {
      title: strings.groupConversion,
      entries: [
        percent(metrics.ctr, item.ctr),
        percent(metrics.cvrOrdered, item.cvrOrdered),
        percent(metrics.cvrConfirmed, item.cvrConfirmed),
        percent(metrics.cvrVisitorsOrdered, item.cvrVisitorsOrdered),
        percent(metrics.cvrVisitorsConfirmed, item.cvrVisitorsConfirmed),
        percent(metrics.cartRate, item.cartRate),
        count(metrics.cartVisitors, item.cartVisitors),
        count(metrics.cartUnits, item.cartUnits),
      ],
    },
    {
      title: strings.groupOrders,
      entries: [
        count(metrics.ordersOrdered, item.ordersOrdered),
        count(metrics.ordersConfirmed, item.ordersConfirmed),
        count(metrics.unitsOrdered, item.unitsOrdered),
        count(metrics.unitsConfirmed, item.unitsConfirmed),
        count(metrics.buyersOrdered, item.buyersOrdered),
        count(metrics.buyersConfirmed, item.buyersConfirmed),
      ],
    },
    {
      title: strings.groupRepurchase,
      entries: [
        percent(metrics.repeatOrderRate, item.repeatOrderRate),
        percent(metrics.repurchaseRateConfirmed, item.repurchaseRateConfirmed),
        count(metrics.avgReorderDays, item.avgReorderDays),
        count(metrics.avgRepurchaseDays, item.avgRepurchaseDays),
      ],
    },
  ];

  const baseEntries = [
    ...(item.modelId ? [{ label: metrics.modelId, value: item.modelId }] : []),
    ...(item.createdAt ? [{ label: metrics.createdAt, value: item.createdAt }] : []),
    ...(item.createdDays !== null && item.createdDays !== undefined
      ? [{ label: metrics.createdDays, value: formatCount(item.createdDays) }]
      : []),
    ...(item.priceFlag ? [{ label: metrics.priceFlag, value: item.priceFlag }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {baseEntries.length > 0 && (
        <MetricGroup title={`${item.itemId} · ${item.itemName.slice(0, 20)}`} entries={baseEntries} />
      )}
      {groups.map((group) => (
        <MetricGroup key={group.title} title={group.title} entries={group.entries} />
      ))}
    </div>
  );
}

function MetricGroup({ title, entries }: { title: string; entries: MetricEntry[] }) {
  return (
    <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
      <div className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
        <div className="w-1 h-3.5 bg-indigo-500 rounded-full"></div>
        <span className="truncate" title={title}>{title}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5">
        {entries.map((entry) => (
          <div key={entry.label} className="min-w-0">
            <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{entry.label}</p>
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={entry.value}>
              {entry.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
