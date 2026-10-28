import { Button } from '../../../components/ui/button';
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
  const coverage = metadata.denominator !== null && metadata.calendarDays > 0
    ? Math.round((metadata.denominator / metadata.calendarDays) * 100)
    : null;


  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-xs"
      style={{ backgroundColor: 'hsl(var(--ui-card))', borderBottom: '1px solid hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
    >
      {stale && (
        <span
          className="flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: 'hsl(var(--ui-warning) / 0.12)', color: 'hsl(var(--ui-warning))' }}
          role="status"
        >
          <AlertTriangle size={12} />
          条件已变化，结果过期 —— 请重新计算后再导出或保存
        </span>
      )}
      <span className="flex items-center gap-1">
        <Clock size={12} style={{ color: 'hsl(var(--ui-muted-foreground))' }} />
        销量区间 {metadata.from} ~ {metadata.to}
        {metadata.shopObservedDays !== null && `（上传 ${metadata.shopObservedDays} 天）`}
        {coverage !== null && `，覆盖自然日 ${coverage}%`}
      </span>
      <span className="flex items-center gap-1">
        <Database size={12} style={{ color: 'hsl(var(--ui-muted-foreground))' }} />
        元仓 {integration.reusedSourceData ? '快照' : '实时'} · {formatDateTime(result.snapshot.stockFetchedAt)}
        <span style={{ color: 'hsl(var(--ui-muted-foreground))' }}>算法 {result.snapshot.algorithmVersion}</span>
      </span>
      <span className="flex items-center gap-1">
        <CheckCircle2 size={12} style={{ color: 'hsl(var(--ui-muted-foreground))' }} />
        仓库范围：{metadata.warehouseScopeSource === 'pool' && metadata.poolName
          ? `库存池「${metadata.poolName}」`
          : metadata.warehouseCodes.join('、')}
      </span>
      {reviewCount > 0 ? (
        <Button variant="ghost" size="sm"
          type="button"
          onClick={onOpenReview}
          className="h-8 flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: 'hsl(var(--ui-warning) / 0.12)', color: 'hsl(var(--ui-warning))' }}
        >
          <PackageSearch size={12} />
          待核对 {reviewCount} 项 · 已自动关联 {resolvedCount} 项（点击处理）
        </Button>
      ) : (
        <span className="flex items-center gap-1" style={{ color: 'hsl(var(--ui-success))' }}>
          <CheckCircle2 size={12} />
          全部 {resolvedCount} 项已自动关联
        </span>
      )}
      {metadata.noSkuVariationCount > 0 && (
        <span style={{ color: 'hsl(var(--ui-muted-foreground))' }} title="规格货号与规格编号均缺失的变体，无法参与计算">
          另有 {metadata.noSkuVariationCount} 个变体缺货号（{metadata.noSkuVariationUnits} 件未计入）
        </span>
      )}
      {integration.warnings.map(warning => (
        <span
          key={warning}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'hsl(var(--ui-destructive) / 0.08)', color: 'hsl(var(--ui-danger))' }}
          role="alert"
        >
          <AlertTriangle size={12} />
          {warning}
        </span>
      ))}
    </div>
  );
}
