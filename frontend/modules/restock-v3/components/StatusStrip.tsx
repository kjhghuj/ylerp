/** 数据状态条：最新销量日/覆盖率/元仓获取时间/匹配状态/待核对数；异常可点击进入处理区 */
import { AlertTriangle, CheckCircle2, Clock, Database, PackageSearch } from 'lucide-react';
import type { ComputeResult } from '../types';
import { formatDateTime } from '../labels';

interface StatusStripProps {
  result: ComputeResult;
  stale: boolean;
  onOpenReview: () => void;
}

export default function StatusStrip({ result, stale, onOpenReview }: StatusStripProps) {
  const { metadata, integration, review } = result;
  const resolvedCount = result.items.length;
  const reviewCount = review.length;
  const latestSalesDate = metadata.to;
  const coverage = metadata.denominator !== null && metadata.calendarDays > 0
    ? Math.round((metadata.denominator / metadata.calendarDays) * 100)
    : null;

  const chipStyle = {
    backgroundColor: 'var(--bg-primary)',
    borderColor: 'var(--border-light)',
  } as const;

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-xs"
      style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}
    >
      {stale && (
        <span
          className="flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#b45309' }}
          role="status"
        >
          <AlertTriangle size={12} />
          条件已变化，结果过期 —— 请重新计算后再导出或保存
        </span>
      )}
      <span className="flex items-center gap-1">
        <Clock size={12} style={{ color: 'var(--text-tertiary)' }} />
        销量区间 {metadata.from} ~ {metadata.to}
        {metadata.shopObservedDays !== null && `（上传 ${metadata.shopObservedDays} 天）`}
        {coverage !== null && `，覆盖自然日 ${coverage}%`}
      </span>
      <span className="flex items-center gap-1">
        <Database size={12} style={{ color: 'var(--text-tertiary)' }} />
        元仓 {integration.reusedSourceData ? '快照' : '实时'} · {formatDateTime(result.snapshot.stockFetchedAt)}
        <span style={{ color: 'var(--text-tertiary)' }}>算法 {result.snapshot.algorithmVersion}</span>
      </span>
      <span className="flex items-center gap-1">
        <CheckCircle2 size={12} style={{ color: 'var(--text-tertiary)' }} />
        仓库范围：{metadata.warehouseScopeSource === 'pool' && metadata.poolName
          ? `库存池「${metadata.poolName}」`
          : metadata.warehouseCodes.join('、')}
      </span>
      {reviewCount > 0 ? (
        <button
          type="button"
          onClick={onOpenReview}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#b45309' }}
        >
          <PackageSearch size={12} />
          待核对 {reviewCount} 项 · 已自动关联 {resolvedCount} 项（点击处理）
        </button>
      ) : (
        <span className="flex items-center gap-1" style={{ color: '#16a34a' }}>
          <CheckCircle2 size={12} />
          全部 {resolvedCount} 项已自动关联
        </span>
      )}
      {metadata.noSkuVariationCount > 0 && (
        <span style={{ color: 'var(--text-tertiary)' }} title="规格货号与规格编号均缺失的变体，无法参与计算">
          另有 {metadata.noSkuVariationCount} 个变体缺货号（{metadata.noSkuVariationUnits} 件未计入）
        </span>
      )}
      {integration.warnings.map(warning => (
        <span
          key={warning}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)', color: '#b91c1c' }}
          role="alert"
        >
          <AlertTriangle size={12} />
          {warning}
        </span>
      ))}
    </div>
  );
}
