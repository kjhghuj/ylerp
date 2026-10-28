import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
/** 表格上方计划操作区：选择摘要与计划操作分组，正常文档流布局避免遮挡分页。 */
import { useState } from 'react';
import { ClipboardCopy, Download, History, Save } from 'lucide-react';
import type { ComputeResult, ConfirmEdit } from '../types';
import { formatInt, formatMoney } from '../labels';

interface SelectionBarProps {
  result: ComputeResult;
  stale: boolean;
  /** 最近一次“刷新源数据”失败：旧快照不能当作有效结果使用 */
  refreshFailed: boolean;
  /** 批量操作统一门槛（含 stale 与 refreshFailed） */
  canBatch: boolean;
  selectedSkus: Set<string>;
  /** 所选中可执行 SKU 集合（不可执行项不可保存） */
  selectedExecutableSkus: string[];
  edits: Record<string, ConfirmEdit>;
  planSaving: boolean;
  canEdit: boolean;
  onSavePlan: (name: string) => void;
  onOpenPlans: () => void;
  onExportAll: () => void;
  onExportSelected: () => void;
  onCopySelected: () => void;
}

export default function SelectionBar(props: SelectionBarProps) {
  const {
    result, stale, refreshFailed, canBatch, selectedSkus, selectedExecutableSkus,
    edits, planSaving, canEdit, onSavePlan, onOpenPlans, onExportAll, onExportSelected, onCopySelected,
  } = props;
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [planName, setPlanName] = useState('');

  const selectedItems = result.items.filter(item => selectedSkus.has(item.sku));
  const totalSuggested = selectedItems.reduce((sum, item) => sum + item.suggestedQty, 0);
  const totalConfirmed = selectedItems.reduce(
    (sum, item) => sum + (edits[item.sku]?.confirmedQty ?? item.suggestedQty),
    0,
  );
  const adjustedCount = selectedItems.filter(item => edits[item.sku]?.confirmedQty !== undefined).length;
  const canSave = canBatch && selectedExecutableSkus.length > 0 && !planSaving && canEdit;

  return (
    <div
      role="region"
      aria-label="补货计划操作"
      className="mx-4 mb-3 min-w-0 shrink-0 rounded-xl border"
      style={{ backgroundColor: 'hsl(var(--ui-card))', borderColor: 'hsl(var(--ui-border))' }}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--ui-border))' }}>
      <span className="text-xs font-semibold" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>计划汇总</span>
      <span className="text-[13px]" style={{ color: 'hsl(var(--ui-foreground))' }}>
        已选 <b>{selectedSkus.size}</b> 个 SKU
      </span>
      <span className="text-[13px]" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
        建议总量 <b className="tabular-nums" style={{ color: 'hsl(var(--ui-foreground))' }}>{formatInt(totalSuggested)}</b>
      </span>
      <span className="text-[13px]" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
        确认总量 <b className="tabular-nums" style={{ color: totalConfirmed !== totalSuggested ? 'hsl(var(--ui-warning))' : 'hsl(var(--ui-foreground))' }}>{formatInt(totalConfirmed)}</b>
        {adjustedCount > 0 && (
          <span className="ml-1 text-[11px]" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>（{adjustedCount} 项人工调整）</span>
        )}
      </span>
      <span className="text-[13px]" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
        估算金额 {selectedItems.some(item => item.costUnknown) ? '部分未知' : formatMoney(
          selectedItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0),
        )}
      </span>

      </div>

      <div className="px-4 empty:hidden">

      {stale && (
        <span className="block text-xs px-3 py-2 mt-3 rounded-lg" style={{ backgroundColor: 'hsl(var(--ui-warning) / 0.12)', color: 'hsl(var(--ui-warning))' }} role="status">
          条件已变化，结果过期 —— 保存/导出/复制已禁用
        </span>
      )}
      {!stale && refreshFailed && (
        <span className="block text-xs px-3 py-2 mt-3 rounded-lg" style={{ backgroundColor: 'hsl(var(--ui-destructive) / 0.1)', color: 'hsl(var(--ui-danger))' }} role="status">
          刷新失败：当前展示的是旧快照，保存/导出/复制已禁用
        </span>
      )}

      </div>
      <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
      <div role="group" aria-label="导出与复制" className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm"
        type="button"
        onClick={onCopySelected}
        disabled={!canBatch || selectedSkus.size === 0}
        className="h-8 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
        style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
        title="复制所选 SKU 与确认量（SKU\\t数量）；仅有效结果可复制"
      >
        <ClipboardCopy size={13} />
        复制
      </Button>
      <Button variant="outline" size="sm"
        type="button"
        onClick={onExportAll}
        disabled={!canBatch || result.items.length === 0}
        className="h-8 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
        style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
        title="导出全部核对结果（含不可执行项的状态标注），仅有效结果可导出"
      >
        <Download size={13} />
        导出全部
      </Button>
      <Button variant="outline" size="sm"
        type="button"
        onClick={onExportSelected}
        disabled={!canBatch || selectedExecutableSkus.length === 0}
        className="h-8 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
        style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
        title="导出所选可执行 SKU 的补货清单（不可执行项不包含）"
      >
        <Download size={13} />
        导出所选（可执行）
      </Button>
      </div>
      <div role="group" aria-label="计划管理" className="flex flex-wrap items-center gap-2 xl:justify-end">
        {selectedSkus.size === 0 && <span className="text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>勾选下方商品后保存计划</span>}
        <Button variant="outline" size="sm"
          type="button"
          onClick={onOpenPlans}
          className="h-8 flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
        >
          <History size={13} />计划列表
        </Button>
        <Button variant="default" size="sm"
          type="button"
          onClick={() => { setPlanName(`补货计划 ${result.metadata.from}~${result.metadata.to}`); setNameDialogOpen(true); }}
          disabled={!canSave}
          className="h-8 flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium  disabled:opacity-40"
          
          title={stale ? '条件已变化，请先重新计算' : refreshFailed ? '刷新失败期间不能保存' : '保存为计划快照（草稿），可继续确认/作废/导出'}
        >
          <Save size={14} />{planSaving ? '保存中…' : '保存计划'}
        </Button>
      </div>
      </div>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="w-[min(420px,92vw)] gap-0 p-4" aria-label="保存补货计划">
            <DialogTitle className="mb-3 text-sm font-semibold">保存补货计划</DialogTitle>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>计划名称</span>
              <Input
                
                value={planName}
                onChange={event => setPlanName(event.target.value)}
                maxLength={100}
                aria-label="计划名称"
                className="h-8 rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: 'hsl(var(--ui-border))', backgroundColor: 'hsl(var(--ui-background))', color: 'hsl(var(--ui-foreground))' }}
              />
            </label>
            <DialogDescription className="text-[12px] mb-3">
              将保存 {selectedExecutableSkus.length} 个可执行 SKU（{result.resultId ? '基于服务端结果快照' : ''}）的建议量、确认量与调整原因，
              并保留完整计算依据（销量来源、逐仓库存、在途明细、中间值）。保存后可确认、作废或导出。
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setNameDialogOpen(false)}
                className="h-8 rounded-lg border px-3 py-1.5 text-[13px]"
                style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
              >
                取消
              </Button>
              <Button variant="default" size="sm"
                type="button"
                disabled={!planName.trim() || planSaving}
                onClick={() => { onSavePlan(planName.trim()); setNameDialogOpen(false); }}
                className="h-8 rounded-lg px-3 py-1.5 text-[13px]  font-medium disabled:opacity-40"
                
              >
                保存草稿
              </Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
