/**
 * 异常处理区：默认只显示未匹配/冲突/缺数据商品；展示销量商品与候选对照、匹配依据与原因。
 * - 冲突（conflict）与待匹配（pending）分状态展示。
 * - 支持按货号/商品名搜索与分页（后端不再静默截断，前端全量分页）。
 * - 候选来源：本地 SKU + 名称相似候选 + 可搜索的全部元仓货品；模糊匹配必须人工确认。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Save, Search, X } from 'lucide-react';
import { CandidatePicker } from '../../restock/components/CandidatePicker';
import { rankRestockTargetSkus, type RankedRestockTargetSku, type RestockTargetSku } from '../../restock/utils/restockTargetSku';
import type { ReviewEntry, TargetSkuItem } from '../types';
import * as restockApi from '../api';
import { SKU_SOURCE_LABELS, formatInt } from '../labels';

interface ReviewPanelProps {
  review: ReviewEntry[];
  site: string;
  canEdit: boolean;
  onMappingSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MappingSelection {
  targetSku: string;
  scope: 'shop' | 'site';
}

const PAGE_SIZE = 20;

export default function ReviewPanel(props: ReviewPanelProps) {
  const { review, site, canEdit, onMappingSaved, open, onOpenChange } = props;
  const [targetSkus, setTargetSkus] = useState<TargetSkuItem[]>([]);
  const [ycProducts, setYcProducts] = useState<Array<{ customerSku: string; customerSkuName: string | null }> | null>(null);
  const [ycSearch, setYcSearch] = useState('');
  const [filterText, setFilterText] = useState('');
  const [page, setPage] = useState(1);
  const [selections, setSelections] = useState<Record<string, MappingSelection>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void restockApi.fetchTargetSkus()
      .then(payload => setTargetSkus(payload.items))
      .catch(() => setTargetSkus([]));
  }, [open]);

  const loadYcProducts = useCallback(async (keyword: string) => {
    try {
      const payload = await restockApi.fetchYcProducts();
      const all = payload.products;
      const needle = keyword.trim().toUpperCase();
      setYcProducts(needle
        ? all.filter(product => product.customerSku.toUpperCase().includes(needle)
          || (product.customerSkuName ?? '').toUpperCase().includes(needle))
        : all);
    } catch {
      setYcProducts([]);
    }
  }, []);

  useEffect(() => {
    if (open && ycSearch.trim().length >= 2) {
      const timer = setTimeout(() => void loadYcProducts(ycSearch), 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, ycSearch, loadYcProducts]);

  const rankedFor = useCallback((entry: ReviewEntry): RankedRestockTargetSku[] => {
    const localPool: RestockTargetSku[] = targetSkus.map(item => ({ id: `local:${item.sku}`, sku: item.sku, name: item.name }));
    // 后端候选（含元仓货品）+ 全部元仓货品搜索结果合并进候选池
    const ycPool: RestockTargetSku[] = [
      ...entry.candidates
        .filter(candidate => candidate.source === 'yc' && candidate.sku !== entry.externalSku)
        .map(candidate => ({ id: `yc:${candidate.sku}`, sku: candidate.sku, name: candidate.name ?? candidate.sku })),
      ...(ycProducts ?? [])
        .filter(product => product.customerSku !== entry.externalSku)
        .slice(0, 30)
        .map(product => ({ id: `ycs:${product.customerSku}`, sku: product.customerSku, name: product.customerSkuName ?? product.customerSku })),
    ];
    return rankRestockTargetSkus(entry.externalSku, [...localPool, ...ycPool]);
  }, [targetSkus, ycProducts]);

  const save = async (entry: ReviewEntry) => {
    const selection = selections[`${entry.shopId}:${entry.identityKey ?? entry.externalSku}`];
    if (!selection?.targetSku) return;
    setSavingKey(`${entry.shopId}:${entry.externalSku}`);
    setError(null);
    try {
      await restockApi.saveMapping({
        shopId: entry.shopId,
        externalSku: entry.externalSku,
        targetSku: selection.targetSku,
        scope: selection.scope,
        // 映射只作用于用户选定的身份（编号类型），不影响同字符串的其他编号类型行
        externalSkuType: entry.skuSource,
      });
      setSelections(previous => {
        const next = { ...previous };
        delete next[`${entry.shopId}:${entry.identityKey ?? entry.externalSku}`];
        return next;
      });
      onMappingSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存映射失败');
    } finally {
      setSavingKey(null);
    }
  };

  const filtered = useMemo(() => {
    const keyword = filterText.trim().toUpperCase();
    if (!keyword) return review;
    return review.filter(entry =>
      entry.externalSku.toUpperCase().includes(keyword)
      || entry.itemName.toUpperCase().includes(keyword)
      || (entry.variationName ?? '').toUpperCase().includes(keyword));
  }, [review, filterText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageEntries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const entriesByShop = useMemo(() => {
    const groups = new Map<string, ReviewEntry[]>();
    for (const entry of pageEntries) {
      const key = `${entry.shopName}（${entry.shopId.slice(0, 8)}）`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return Array.from(groups.entries());
  }, [pageEntries]);

  const conflictCount = review.filter(entry => entry.status === 'conflict').length;

  if (review.length === 0) return null;

  return (
    <section
      className="mx-4 mb-3 rounded-xl border overflow-hidden"
      style={{ borderColor: 'rgba(217, 119, 6, 0.4)', backgroundColor: 'rgba(217, 119, 6, 0.04)' }}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-[13px] font-semibold" style={{ color: '#b45309' }}>
          待核对商品（{review.length}）
        </span>
        {conflictCount > 0 && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#b91c1c' }}>
            其中冲突 {conflictCount} 项（映射矛盾，必须人工裁决）
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          未匹配 / 映射冲突 / 编码异常 —— 处理完成后需重新计算
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {error && <p className="text-xs mb-2" style={{ color: '#b91c1c' }} role="alert">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="flex items-center gap-1 rounded-lg border px-2 py-1 flex-1 min-w-[180px] max-w-[300px]" style={{ borderColor: 'var(--border-light)' }}>
              <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="search"
                value={filterText}
                onChange={event => { setFilterText(event.target.value); setPage(1); }}
                placeholder="搜索货号 / 商品名"
                aria-label="搜索待核对商品"
                className="bg-transparent outline-none text-[12.5px] w-full"
                style={{ color: 'var(--text-primary)' }}
              />
            </label>
            <label className="flex items-center gap-1 rounded-lg border px-2 py-1 flex-1 min-w-[200px] max-w-[320px]" style={{ borderColor: 'var(--border-light)' }}>
              <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="search"
                value={ycSearch}
                onChange={event => setYcSearch(event.target.value)}
                placeholder="搜索全部元仓货品（≥2 字符）"
                aria-label="搜索全部元仓货品"
                className="bg-transparent outline-none text-[12.5px] w-full"
                style={{ color: 'var(--text-primary)' }}
              />
            </label>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {filtered.length} 项 · 第 {currentPage}/{pageCount} 页
            </span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-40" style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>上一页</button>
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-40" style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>下一页</button>
            </div>
          </div>
          {entriesByShop.map(([shopLabel, entries]) => (
            <div key={shopLabel} className="mb-3 last:mb-0">
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{shopLabel}</p>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
                <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 900 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)' }}>
                      <th className="px-2 py-1.5 text-left font-medium">状态</th>
                      <th className="px-2 py-1.5 text-left font-medium">规格货号（来源）</th>
                      <th className="px-2 py-1.5 text-left font-medium">商品 / 规格</th>
                      <th className="px-2 py-1.5 text-right font-medium">件数</th>
                      <th className="px-2 py-1.5 text-left font-medium">原因</th>
                      <th className="px-2 py-1.5 text-left font-medium w-[280px]">映射到（人工确认）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => {
                      const key = `${entry.shopId}:${entry.identityKey ?? entry.externalSku}`;
                      const selection = selections[key];
                      const ranked = rankedFor(entry);
                      const isConflict = entry.status === 'conflict';
                      return (
                        <tr key={key} style={{ borderTop: '1px solid var(--border-light)' }}>
                          <td className="px-2 py-1.5">
                            <span
                              className="text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={isConflict
                                ? { backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#b91c1c' }
                                : { backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}
                            >
                              {isConflict ? '冲突' : '待匹配'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5" style={{ color: 'var(--text-primary)' }}>
                            <span className="font-medium">{entry.displaySku}</span>
                            <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>（{SKU_SOURCE_LABELS[entry.skuSource]}）</span>
                          </td>
                          <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {entry.itemName}{entry.variationName ? ` / ${entry.variationName}` : ''}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatInt(entry.units)}</td>
                          <td className="px-2 py-1.5" style={{ color: isConflict ? '#b91c1c' : '#b45309' }}>
                            {entry.reasons.map(reason => <div key={reason}>{reason}</div>)}
                          </td>
                          <td className="px-2 py-1.5">
                            {canEdit ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <CandidatePicker
                                    itemId={`v3-${entry.shopId}-${entry.externalSku}`.replace(/[^A-Za-z0-9_-]/g, '-')}
                                    candidates={ranked}
                                    selectedSku={selection?.targetSku ?? ''}
                                    onChange={sku => setSelections(previous => ({
                                      ...previous,
                                      [key]: { targetSku: sku, scope: previous[key]?.scope ?? 'shop' },
                                    }))}
                                  />
                                </div>
                                <select
                                  aria-label="映射作用域"
                                  value={selection?.scope ?? 'shop'}
                                  onChange={event => selection && setSelections(previous => ({
                                    ...previous,
                                    [key]: { targetSku: selection.targetSku, scope: event.target.value as 'shop' | 'site' },
                                  }))}
                                  className="rounded border px-1 py-1 text-[12px]"
                                  style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                                  title="店铺级仅本店生效；站点级写入 V2 共享映射"
                                >
                                  <option value="shop">店铺级</option>
                                  <option value="site">站点级</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={!selection?.targetSku || savingKey === `${entry.shopId}:${entry.externalSku}`}
                                  onClick={() => void save(entry)}
                                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-white disabled:opacity-40"
                                  style={{ backgroundColor: 'var(--primary)' }}
                                >
                                  <Save size={11} />
                                  {savingKey === `${entry.shopId}:${entry.externalSku}` ? '保存中' : '保存'}
                                </button>
                                {selection?.targetSku && (
                                  <button
                                    type="button"
                                    aria-label="清除选择"
                                    onClick={() => setSelections(previous => {
                                      const next = { ...previous };
                                      delete next[key];
                                      return next;
                                    })}
                                    className="p-1 rounded"
                                    style={{ color: 'var(--text-tertiary)' }}
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>只读权限，无法修改映射</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
            提示：名称/前缀相似的候选仅供参考（匹配度百分比），系统不会自动确认；冲突项（如元仓同码与历史映射矛盾）必须人工裁决后才能参与计算。保存映射后结果将标记为过期，需重新计算。
            {site && ` 站点级映射会同步到补货V2（${site}）。`}
          </p>
        </div>
      )}
    </section>
  );
}
