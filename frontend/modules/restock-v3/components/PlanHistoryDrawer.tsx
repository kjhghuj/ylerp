/** 计划列表抽屉：搜索/分页、详情（历史计算依据）、草稿编辑、确认（重复提醒）、作废、复制为新版本、导出 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, XCircle } from 'lucide-react';
import Drawer from './ui/Drawer';
import type { PlanListItem, PlanSnapshot } from '../types';
import * as restockApi from '../api';
import { RestockApiError } from '../api';
import { formatDateTime, formatInt } from '../labels';

interface PlanHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 列表数据由抽屉内部加载（支持搜索/分页）；初始为 null 表示加载中 */
  canEdit: boolean;
  onNotice: (message: string) => void;
  /** 列表变化后通知工作台刷新缓存 */
  onPlansChanged: () => void;
}

const STATUS_META: Record<PlanListItem['status'], { label: string; color: string }> = {
  draft: { label: '草稿', color: '#64748b' },
  confirmed: { label: '已确认', color: '#16a34a' },
  void: { label: '已作废', color: '#94a3b8' },
};

const PAGE_SIZE = 10;

export default function PlanHistoryDrawer(props: PlanHistoryDrawerProps) {
  const { open, onClose, canEdit, onNotice, onPlansChanged } = props;
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | PlanListItem['status']>('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [detail, setDetail] = useState<{ plan: PlanSnapshot; legacy: boolean } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await restockApi.fetchPlans({
        page,
        pageSize: PAGE_SIZE,
        ...(search.trim() ? { q: search.trim() } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setPlans(payload.plans);
      setTotal(payload.total);
    } catch (loadErr) {
      setLoadError(loadErr instanceof Error ? loadErr.message : '获取补货计划失败');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const payload = await restockApi.fetchPlan(id);
      setDetail({ plan: payload.plan, legacy: payload.legacy === true });
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '获取计划详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /**
   * 乐观并发冲突（409）：计划已被其他操作更新。刷新列表与详情后提示用户
   * 重新核对最新数据再决定——不自动重试提交（避免在过期认知上确认旧数量）。
   */
  const handleConcurrencyConflict = useCallback(async (message: string) => {
    setError(`${message} 已刷新为最新数据，请重新核对后再操作。`);
    await load();
    if (detail?.plan.id) {
      try {
        const payload = await restockApi.fetchPlan(detail.plan.id);
        setDetail({ plan: payload.plan, legacy: payload.legacy === true });
      } catch {
        setDetail(null);
      }
    }
  }, [load, detail]);

  const confirm = useCallback(async (plan: PlanListItem) => {
    if (plan.revision === undefined) {
      setError('计划列表缺少修订号，请刷新后重试');
      await load();
      return;
    }
    setBusyId(plan.id);
    setError(null);
    try {
      const payload = await restockApi.confirmPlan(plan.id, plan.revision);
      const warnings = payload.duplicatePlanWarnings ?? [];
      onNotice(warnings.length > 0
        ? `计划已确认。注意：${warnings.join('；')}`
        : '计划已确认（确认 ≠ 已下单，不会计入元仓在途）');
      await load();
      onPlansChanged();
    } catch (confirmError) {
      if (confirmError instanceof RestockApiError && confirmError.status === 409) {
        await handleConcurrencyConflict(confirmError.message);
      } else {
        setError(confirmError instanceof Error ? confirmError.message : '确认失败');
      }
    } finally {
      setBusyId(null);
    }
  }, [load, onNotice, onPlansChanged, handleConcurrencyConflict]);

  const voidPlan = useCallback(async (plan: PlanListItem, reason: string) => {
    if (plan.revision === undefined) {
      setError('计划列表缺少修订号，请刷新后重试');
      await load();
      return;
    }
    if (!reason.trim()) return;
    setBusyId(plan.id);
    setError(null);
    try {
      await restockApi.voidPlan(plan.id, reason.trim(), plan.revision!);
      onNotice('计划已作废');
      setVoidingId(null);
      setVoidReason('');
      await load();
      onPlansChanged();
    } catch (voidError) {
      if (voidError instanceof RestockApiError && voidError.status === 409) {
        setVoidingId(null);
        setVoidReason('');
        await handleConcurrencyConflict(voidError.message);
      } else {
        setError(voidError instanceof Error ? voidError.message : '作废失败');
      }
    } finally {
      setBusyId(null);
    }
  }, [load, onNotice, onPlansChanged, handleConcurrencyConflict]);

  const copyPlan = useCallback(async (plan: PlanListItem) => {
    setBusyId(plan.id);
    setError(null);
    try {
      const payload = await restockApi.copyPlan(plan.id);
      onNotice(`已复制为新草稿版本（v${payload.plan.version ?? plan.version ?? '?'}），可修改后确认`);
      await load();
      onPlansChanged();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : '复制失败');
    } finally {
      setBusyId(null);
    }
  }, [load, onNotice, onPlansChanged]);

  const exportPlan = useCallback(async (plan: PlanListItem) => {
    setBusyId(plan.id);
    setError(null);
    try {
      await restockApi.exportPlanCsv(plan.id, `补货计划_${plan.name}_${plan.id.slice(0, 8)}.csv`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败');
    } finally {
      setBusyId(null);
    }
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Drawer open={open} onClose={onClose} title="补货计划" subtitle="快照版本：草稿 → 已确认 → 已作废；确认不等于下单" width={620}>
      {error && <p className="text-xs mb-2" style={{ color: '#b91c1c' }} role="alert">{error}</p>}

      {/* 搜索与筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="flex items-center gap-1 rounded-lg border px-2 py-1 flex-1 min-w-[160px]" style={{ borderColor: 'var(--border-light)' }}>
          <input
            type="search"
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="按计划名称搜索"
            aria-label="搜索计划名称"
            className="bg-transparent outline-none text-[12.5px] w-full"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <select
          value={statusFilter}
          onChange={event => { setStatusFilter(event.target.value as '' | PlanListItem['status']); setPage(1); }}
          aria-label="按状态筛选"
          className="rounded-lg border px-2 py-1 text-[12.5px]"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="confirmed">已确认</option>
          <option value="void">已作废</option>
        </select>
      </div>

      {loading && <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>加载中…</p>}
      {!loading && loadError && (
        <p className="text-[13px] mb-2" style={{ color: '#b91c1c' }} role="alert">
          {loadError}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>重试</button>
        </p>
      )}
      {!loading && !loadError && plans !== null && plans.length === 0 && (
        <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          暂无计划。在结果表中勾选可执行 SKU 后点击「保存计划」生成草稿。
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(plans ?? []).map(plan => {
          const meta = STATUS_META[plan.status];
          const summary = plan.summary as { totalSuggestedQty?: number; savedItemCount?: number; totalConfirmedQty?: number };
          return (
            <div key={plan.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openDetail(plan.id)}
                  className="text-[13px] font-medium truncate flex-1 text-left underline-offset-2 hover:underline"
                  style={{ color: 'var(--text-primary)' }}
                  title="查看详情（含历史计算依据）"
                >
                  {plan.name}
                </button>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: 'rgba(0,0,0,0.05)', color: meta.color }}>
                  {meta.label}{plan.version && plan.version > 1 ? ` v${plan.version}` : ''}
                </span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {plan.site} · {plan.rangeFrom} ~ {plan.rangeTo} · {formatDateTime(plan.confirmedAt ?? plan.createdAt)}
                {summary?.savedItemCount !== undefined && ` · ${summary.savedItemCount} SKU`}
                {summary?.totalConfirmedQty !== undefined && ` · 确认 ${formatInt(summary.totalConfirmedQty)} 件`}
                {(plan.warehouseCodes?.length ?? 0) > 0 ? ` · ${plan.warehouseCodes!.length} 仓` : ' · 整站范围'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  disabled={busyId === plan.id || detailLoading}
                  onClick={() => void openDetail(plan.id)}
                  className="rounded-lg border px-2 py-1 text-[12px]"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                >
                  详情
                </button>
                {plan.status === 'draft' && canEdit && (
                  <button
                    type="button"
                    disabled={busyId === plan.id}
                    onClick={() => void confirm(plan)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-white disabled:opacity-40"
                    style={{ backgroundColor: '#16a34a' }}
                  >
                    <CheckCircle2 size={12} />
                    确认
                  </button>
                )}
                {plan.status !== 'void' && canEdit && (
                  voidingId === plan.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={voidReason}
                        onChange={event => setVoidReason(event.target.value)}
                        placeholder="作废原因（必填）"
                        aria-label="作废原因"
                        maxLength={200}
                        className="rounded border px-1.5 py-1 text-[12px] w-40"
                        style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                      <button
                        type="button"
                        disabled={!voidReason.trim() || busyId === plan.id}
                        onClick={() => void voidPlan(plan, voidReason)}
                        className="rounded-lg px-2 py-1 text-[12px] text-white disabled:opacity-40"
                        style={{ backgroundColor: '#dc2626' }}
                      >
                        确认作废
                      </button>
                      <button
                        type="button"
                        onClick={() => { setVoidingId(null); setVoidReason(''); }}
                        className="text-[12px]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === plan.id}
                      onClick={() => setVoidingId(plan.id)}
                      className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] disabled:opacity-40"
                      style={{ borderColor: 'var(--border-light)', color: '#dc2626' }}
                    >
                      <XCircle size={12} />
                      作废
                    </button>
                  )
                )}
                {plan.status === 'confirmed' && canEdit && (
                  <button
                    type="button"
                    disabled={busyId === plan.id}
                    onClick={() => void copyPlan(plan)}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] disabled:opacity-40"
                    style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                    title="复制为新草稿版本（原计划保留在历史中）"
                  >
                    <Copy size={12} />
                    复制为新版本
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === plan.id}
                  onClick={() => void exportPlan(plan)}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] disabled:opacity-40"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                  title="导出与保存版本一致的 CSV（含计划号/时间/口径）"
                >
                  <Download size={12} />
                  导出
                </button>
                {plan.voidReason && (
                  <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }} title={plan.voidReason}>
                    作废原因：{plan.voidReason}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>第 {page} / {pageCount} 页 · 共 {total} 条</span>
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: 'var(--border-light)' }}>上一页</button>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: 'var(--border-light)' }}>下一页</button>
        </div>
      )}

      {/* 详情视图：历史计算依据 */}
      {detailLoading && <p className="text-[13px] mt-3" style={{ color: 'var(--text-tertiary)' }}>加载详情…</p>}
      {detail && !detailLoading && (
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {detail.plan.name}{detail.plan.version && detail.plan.version > 1 ? `（v${detail.plan.version}）` : ''}
            </h3>
            <button type="button" onClick={() => setDetail(null)} className="text-xs underline" style={{ color: 'var(--text-tertiary)' }}>收起</button>
          </div>
          {detail.legacy && (
            <p className="text-[12px] mb-2 px-2 py-1 rounded-lg" style={{ backgroundColor: 'rgba(217, 119, 6, 0.1)', color: '#b45309' }} role="note">
              历史版本：信息不完整（仅含保存时的 SKU 与数量，无计算依据快照）
            </p>
          )}
          {!detail.legacy && (
            <>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>
                计算依据快照：算法 {String((detail.plan.snapshotMeta as Record<string, unknown>)?.algorithmVersion ?? '—')}
                · 数据获取 {formatDateTime(String((detail.plan.snapshotMeta as Record<string, unknown>)?.salesFetchedAt ?? '') || null)}
                {detail.plan.resultId ? ' · 含完整溯源（来源/逐仓/在途/中间值）' : ''}
              </p>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-light)' }}>
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 520 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)' }}>
                      <th className="px-2 py-1 text-left font-medium">SKU</th>
                      <th className="px-2 py-1 text-right font-medium">预测日销</th>
                      <th className="px-2 py-1 text-right font-medium">可用库存</th>
                      <th className="px-2 py-1 text-right font-medium">确定在途</th>
                      <th className="px-2 py-1 text-right font-medium">建议量</th>
                      <th className="px-2 py-1 text-right font-medium">确认量</th>
                      <th className="px-2 py-1 text-left font-medium">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((detail.plan.items ?? []) as Array<Record<string, unknown>>).map((item, index) => (
                      <tr key={String(item.sku ?? index)} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td className="px-2 py-1" style={{ color: 'var(--text-primary)' }}>{String(item.sku ?? '')}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(item.adjustedDailySales ?? 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(item.availableStock ?? 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(item.inTransit ?? 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(item.suggestedQty ?? 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(item.confirmedQty ?? 0)}</td>
                        <td className="px-2 py-1" style={{ color: 'var(--text-tertiary)' }}>{String(item.adjustReason ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
