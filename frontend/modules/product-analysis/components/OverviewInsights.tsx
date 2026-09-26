import React, { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useProductAnalysisStrings } from '../i18n';
import { formatCount } from '../utils/format';
import type { EstablishedTrendsResponse, PotentialItem } from '../types';

type OverviewState<T> = { status: 'loading' } | { status: 'error'; detail: string } | { status: 'success'; data: T };

function RankingPager({ title, page, pageSize, total, onPageChange }: {
  title: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const strings = useProductAnalysisStrings();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pa-insight-pager" aria-label={`${title}${strings.overview.pagination}`}>
      <span className="pa-insight-page-range">{strings.overview.pageRange
        .replace('{start}', String((page - 1) * pageSize + 1))
        .replace('{end}', String(Math.min(page * pageSize, total)))
        .replace('{total}', String(total))}</span>
      <div className="pa-insight-page-actions">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={`${title}${strings.prevPage}`}>{strings.prevPage}</button>
        <span>{page} / {pageCount}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label={`${title}${strings.nextPage}`}>{strings.nextPage}</button>
      </div>
    </nav>
  );
}

function CardState({ state, onRetry }: { state: OverviewState<unknown>; onRetry: () => void }) {
  const strings = useProductAnalysisStrings();
  if (state.status === 'loading') return <div className="pa-insight-state" role="status"><Loader2 size={20} className="animate-spin" /></div>;
  if (state.status === 'error') return (
    <div className="pa-insight-state pa-insight-error" role="alert">
      <span>{strings.refreshFailed.replace('{detail}', state.detail)}</span>
      <button type="button" className="pa-insight-link" onClick={onRetry}>{strings.potential.retry}</button>
    </div>
  );
  return null;
}

export function NewPotentialCard({ state, pageSize, onRetry, onMore, onSelect }: {
  state: OverviewState<PotentialItem[]>;
  pageSize: number;
  onRetry: () => void;
  onMore: () => void;
  onSelect: (item: PotentialItem) => void;
}) {
  const strings = useProductAnalysisStrings();
  const [page, setPage] = useState(1);
  const items = state.status === 'success' ? state.data : null;
  useEffect(() => setPage(1), [items]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil((items?.length ?? 0) / pageSize)));
  const visibleItems = items?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? [];
  return (
    <section className="pa-card pa-insight-card" aria-label={strings.overview.newPotentialTitle}>
      <div className="pa-insight-heading">
        <div>
          <h3 className="pa-card-title"><Sparkles size={16} />{strings.overview.newPotentialTitle}</h3>
          <p className="pa-card-sub">{strings.overview.newPotentialHint}</p>
        </div>
        <button type="button" className="pa-insight-link" onClick={onMore}>{strings.overview.viewPotential}<ArrowRight size={14} /></button>
      </div>
      {state.status !== 'success' ? <CardState state={state} onRetry={onRetry} /> : state.data.length === 0 ? (
        <div className="pa-insight-state" role="status">{strings.potential.empty}</div>
      ) : (
        <>
        <div className={`pa-insight-list${visibleItems.length >= 6 ? ' pa-insight-list-fill' : ''}`}>
          {visibleItems.map((item) => (
            <button type="button" key={item.itemId} className="pa-insight-row" onClick={() => onSelect(item)} title={item.itemName}>
              <span className="pa-insight-rank">{item.rank}</span>
              <span className="pa-insight-name">{item.itemName}</span>
              <span className="pa-insight-meta">{strings.card.orders} {formatCount(item.metrics.ordersOrdered)}</span>
              <span className="pa-insight-score">{strings.potential.score} {item.score.toFixed(1)}</span>
            </button>
          ))}
        </div>
        <RankingPager title={strings.overview.newPotentialTitle} page={currentPage} pageSize={pageSize} total={state.data.length} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function OrderSparkline({ points }: { points: EstablishedTrendsResponse['items'][number]['dailyOrders'] }) {
  const observed = points.filter((point): point is { date: string; orders: number } => point.orders !== null);
  if (observed.length < 2) return null;
  const max = Math.max(1, ...observed.map((point) => point.orders));
  const first = Date.parse(`${points[0].date}T00:00:00Z`);
  const span = Math.max(1, Date.parse(`${points[points.length - 1].date}T00:00:00Z`) - first);
  let previousDate: number | null = null;
  const path = points.map((point) => {
    const date = Date.parse(`${point.date}T00:00:00Z`);
    if (point.orders === null) { previousDate = null; return ''; }
    const command = previousDate === null || date - previousDate > 86_400_000 ? 'M' : 'L';
    previousDate = date;
    return `${command}${((date - first) / span) * 88},${26 - (point.orders / max) * 22}`;
  }).filter(Boolean).join(' ');
  return <svg className="pa-insight-sparkline" viewBox="0 0 88 30" aria-hidden="true">
    <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    {observed.map((point) => <circle key={point.date} cx={((Date.parse(`${point.date}T00:00:00Z`) - first) / span) * 88} cy={26 - (point.orders / max) * 22} r="2" fill="currentColor" />)}
  </svg>;
}

export function EstablishedTrendCard({ state, pageSize, onRetry, onSelect }: {
  state: OverviewState<EstablishedTrendsResponse>;
  pageSize: number;
  onRetry: () => void;
  onSelect: (item: EstablishedTrendsResponse['items'][number]) => void;
}) {
  const strings = useProductAnalysisStrings();
  const [page, setPage] = useState(1);
  const items = state.status === 'success' ? state.data.items : null;
  useEffect(() => setPage(1), [items]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil((items?.length ?? 0) / pageSize)));
  const visibleItems = items?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? [];
  return (
    <section className="pa-card pa-insight-card" aria-label={strings.overview.oldTrendTitle}>
      <div className="pa-insight-heading">
        <div>
          <h3 className="pa-card-title"><TrendingUp size={16} />{strings.overview.oldTrendTitle}</h3>
          <p className="pa-card-sub">{strings.overview.oldTrendHint}</p>
        </div>
      </div>
      {state.status !== 'success' ? <CardState state={state} onRetry={onRetry} /> : state.data.items.length === 0 ? (
        <div className="pa-insight-state" role="status">{strings.overview.oldTrendEmpty}</div>
      ) : (
        <>
        <div className={`pa-insight-list${visibleItems.length >= 6 ? ' pa-insight-list-fill' : ''}`}>
          {visibleItems.map((item) => {
            const decline = item.changePercent !== null && item.changePercent < 0;
            const change = item.changePercent === null
              ? strings.overview.newOrders
              : `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(0)}%`;
            return (
              <button type="button" key={item.itemId} className="pa-insight-row pa-trend-row" onClick={() => onSelect(item)} title={strings.overview.oldTrendCoverage
                .replace('{prev}', String(item.previousObservedDays)).replace('{recent}', String(item.recentObservedDays))
                .replaceAll('{window}', String(state.data.windowDays))}>
                <span className="pa-insight-name">{item.itemName}</span>
                <span className="pa-insight-meta">{formatCount(item.previousDailyOrders)} → {formatCount(item.recentDailyOrders)} {strings.overview.ordersPerDay}</span>
                <OrderSparkline points={item.dailyOrders} />
                <span className={`pa-trend-change ${decline ? 'pa-trend-down' : 'pa-trend-up'}`}>
                  {decline ? <TrendingDown size={13} /> : <TrendingUp size={13} />}{change}
                </span>
              </button>
            );
          })}
        </div>
        <RankingPager title={strings.overview.oldTrendTitle} page={currentPage} pageSize={pageSize} total={state.data.items.length} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}
