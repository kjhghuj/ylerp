/** 底部选中操作栏：已选 SKU 与数量（建议量 vs 确认量）、保存计划、计划列表、导出（全部/所选可执行） */
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
      className="sticky bottom-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 border-t"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
        已选 <b>{selectedSkus.size}</b> 个 SKU
      </span>
      <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        建议总量 <b className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatInt(totalSuggested)}</b>
      </span>
      <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        确认总量 <b className="tabular-nums" style={{ color: totalConfirmed !== totalSuggested ? '#d97706' : 'var(--text-primary)' }}>{formatInt(totalConfirmed)}</b>
        {adjustedCount > 0 && (
          <span className="ml-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>（{adjustedCount} 项人工调整）</span>
        )}
      </span>
      <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        估算金额 {selectedItems.some(item => item.costUnknown) ? '部分未知' : formatMoney(
          selectedItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0),
        )}
      </span>

      <div className="flex-1" />

      {stale && (
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#b45309' }} role="status">
          条件已变化，结果过期 —— 保存/导出/复制已禁用
        </span>
      )}
      {!stale && refreshFailed && (
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#b91c1c' }} role="status">
          刷新失败：当前展示的是旧快照，保存/导出/复制已禁用
        </span>
      )}

      <button
        type="button"
        onClick={onCopySelected}
        disabled={!canBatch || selectedSkus.size === 0}
        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        title="复制所选 SKU 与确认量（SKU\\t数量）；仅有效结果可复制"
      >
        <ClipboardCopy size={13} />
        复制
      </button>
      <button
        type="button"
        onClick={() => { setPlanName(`补货计划 ${result.metadata.from}~${result.metadata.to}`); setNameDialogOpen(true); }}
        disabled={!canSave}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        style={{ backgroundColor: 'var(--primary)' }}
        title={stale ? '条件已变化，请先重新计算' : refreshFailed ? '刷新失败期间不能保存' : '保存为计划快照（草稿），可继续确认/作废/导出'}
      >
        <Save size={13} />
        {planSaving ? '保存中…' : '保存计划'}
      </button>
      <button
        type="button"
        onClick={onOpenPlans}
        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        <History size={13} />
        计划列表
      </button>
      <button
        type="button"
        onClick={onExportAll}
        disabled={!canBatch || result.items.length === 0}
        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        title="导出全部核对结果（含不可执行项的状态标注），仅有效结果可导出"
      >
        <Download size={13} />
        导出全部
      </button>
      <button
        type="button"
        onClick={onExportSelected}
        disabled={!canBatch || selectedExecutableSkus.length === 0}
        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        title="导出所选可执行 SKU 的补货清单（不可执行项不包含）"
      >
        <Download size={13} />
        导出所选（可执行）
      </button>

      {nameDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="保存补货计划">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }} onClick={() => setNameDialogOpen(false)} />
          <div
            className="relative rounded-xl border p-4 w-[min(420px,92vw)] shadow-lg"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
          >
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>保存补货计划</h3>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>计划名称</span>
              <input
                autoFocus
                value={planName}
                onChange={event => setPlanName(event.target.value)}
                maxLength={100}
                aria-label="计划名称"
                className="rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </label>
            <p className="text-[12px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
              将保存 {selectedExecutableSkus.length} 个可执行 SKU（{result.resultId ? '基于服务端结果快照' : ''}）的建议量、确认量与调整原因，
              并保留完整计算依据（销量来源、逐仓库存、在途明细、中间值）。保存后可确认、作废或导出。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNameDialogOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-[13px]"
                style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={!planName.trim() || planSaving}
                onClick={() => { onSavePlan(planName.trim()); setNameDialogOpen(false); }}
                className="rounded-lg px-3 py-1.5 text-[13px] text-white font-medium disabled:opacity-40"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                保存草稿
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
