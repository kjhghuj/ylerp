import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../../components/ui/table';
import { NativeSelect } from '../../../components/ui/native-select';
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
      style={{ borderColor: 'hsl(var(--ui-warning) / 0.4)', backgroundColor: 'hsl(var(--ui-warning) / 0.04)' }}
    >
      <Button variant="ghost" size="sm"
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="h-auto flex flex-wrap justify-start items-center gap-2 w-full px-3 py-2 text-left whitespace-normal"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-[13px] font-semibold" style={{ color: 'hsl(var(--ui-warning))' }}>
          待核对商品（{review.length}）
        </span>
        {conflictCount > 0 && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--ui-destructive) / 0.1)', color: 'hsl(var(--ui-danger))' }}>
            其中冲突 {conflictCount} 项（映射矛盾，必须人工裁决）
          </span>
        )}
        <span className="text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
          未匹配 / 映射冲突 / 编码异常 —— 处理完成后需重新计算
        </span>
      </Button>
      {open && (
        <div className="px-3 pb-3">
          {error && <p className="text-xs mb-2" style={{ color: 'hsl(var(--ui-danger))' }} role="alert">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="relative flex-1 min-w-[180px] max-w-[300px]" style={{ borderColor: 'hsl(var(--ui-border))' }}>
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2" style={{ color: 'hsl(var(--ui-muted-foreground))' }} />
              <Input
                type="search"
                value={filterText}
                onChange={event => { setFilterText(event.target.value); setPage(1); }}
                placeholder="搜索货号 / 商品名"
                aria-label="搜索待核对商品"
                className="h-8 pl-8 text-[12.5px] w-full"
                style={{ color: 'hsl(var(--ui-foreground))' }}
              />
            </label>
            <label className="relative flex-1 min-w-[200px] max-w-[320px]" style={{ borderColor: 'hsl(var(--ui-border))' }}>
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2" style={{ color: 'hsl(var(--ui-muted-foreground))' }} />
              <Input
                type="search"
                value={ycSearch}
                onChange={event => setYcSearch(event.target.value)}
                placeholder="搜索全部元仓货品（≥2 字符）"
                aria-label="搜索全部元仓货品"
                className="h-8 pl-8 text-[12.5px] w-full"
                style={{ color: 'hsl(var(--ui-foreground))' }}
              />
            </label>
            <span className="text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
              {filtered.length} 项 · 第 {currentPage}/{pageCount} 页
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="h-8 rounded border px-1.5 py-0.5 text-xs disabled:opacity-40" style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}>上一页</Button>
              <Button variant="outline" size="sm" type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="h-8 rounded border px-1.5 py-0.5 text-xs disabled:opacity-40" style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}>下一页</Button>
            </div>
          </div>
          {entriesByShop.map(([shopLabel, entries]) => (
            <div key={shopLabel} className="mb-3 last:mb-0">
              <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{shopLabel}</p>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'hsl(var(--ui-border))', backgroundColor: 'hsl(var(--ui-card))' }}>
                <Table wrapped={false} className="w-full text-[12.5px] border-collapse" style={{ minWidth: 900 }}>
                  <TableHeader>
                    <TableRow style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
                      <TableHead className="h-9 px-2 py-1.5 text-left font-medium">状态</TableHead>
                      <TableHead className="h-9 px-2 py-1.5 text-left font-medium">规格货号（来源）</TableHead>
                      <TableHead className="h-9 px-2 py-1.5 text-left font-medium">商品 / 规格</TableHead>
                      <TableHead className="h-9 px-2 py-1.5 text-right font-medium">件数</TableHead>
                      <TableHead className="h-9 px-2 py-1.5 text-left font-medium">原因</TableHead>
                      <TableHead className="h-9 px-2 py-1.5 text-left font-medium w-[280px]">映射到（人工确认）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(entry => {
                      const key = `${entry.shopId}:${entry.identityKey ?? entry.externalSku}`;
                      const selection = selections[key];
                      const ranked = rankedFor(entry);
                      const isConflict = entry.status === 'conflict';
                      return (
                        <TableRow key={key} style={{ borderTop: '1px solid hsl(var(--ui-border))' }}>
                          <TableCell className="px-2 py-1.5">
                            <span
                              className="text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={isConflict
                                ? { backgroundColor: 'hsl(var(--ui-destructive) / 0.1)', color: 'hsl(var(--ui-danger))' }
                                : { backgroundColor: 'hsl(var(--ui-background))', color: 'hsl(var(--ui-muted-foreground))' }}
                            >
                              {isConflict ? '冲突' : '待匹配'}
                            </span>
                          </TableCell>
                          <TableCell className="px-2 py-1.5" style={{ color: 'hsl(var(--ui-foreground))' }}>
                            <span className="font-medium">{entry.displaySku}</span>
                            <span className="ml-1" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>（{SKU_SOURCE_LABELS[entry.skuSource]}）</span>
                          </TableCell>
                          <TableCell className="px-2 py-1.5" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
                            {entry.itemName}{entry.variationName ? ` / ${entry.variationName}` : ''}
                          </TableCell>
                          <TableCell className="px-2 py-1.5 text-right tabular-nums">{formatInt(entry.units)}</TableCell>
                          <TableCell className="px-2 py-1.5" style={{ color: isConflict ? 'hsl(var(--ui-danger))' : 'hsl(var(--ui-warning))' }}>
                            {entry.reasons.map(reason => <div key={reason}>{reason}</div>)}
                          </TableCell>
                          <TableCell className="px-2 py-1.5">
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
                                <NativeSelect
                                  aria-label="映射作用域"
                                  value={selection?.scope ?? 'shop'}
                                  onChange={event => selection && setSelections(previous => ({
                                    ...previous,
                                    [key]: { targetSku: selection.targetSku, scope: event.target.value as 'shop' | 'site' },
                                  }))}
                                  className="h-8 w-auto rounded border px-1 py-1 text-[12px]"
                                  style={{ borderColor: 'hsl(var(--ui-border))', backgroundColor: 'hsl(var(--ui-background))', color: 'hsl(var(--ui-foreground))' }}
                                  title="店铺级仅本店生效；站点级写入 V2 共享映射"
                                >
                                  <option value="shop">店铺级</option>
                                  <option value="site">站点级</option>
                                </NativeSelect>
                                <Button variant="default" size="sm"
                                  type="button"
                                  disabled={!selection?.targetSku || savingKey === `${entry.shopId}:${entry.externalSku}`}
                                  onClick={() => void save(entry)}
                                  className="h-8 flex items-center gap-1 rounded-lg px-2 py-1 text-[12px]  disabled:opacity-40"
                                  
                                >
                                  <Save size={11} />
                                  {savingKey === `${entry.shopId}:${entry.externalSku}` ? '保存中' : '保存'}
                                </Button>
                                {selection?.targetSku && (
                                  <Button variant="outline" size="sm"
                                    type="button"
                                    aria-label="清除选择"
                                    onClick={() => setSelections(previous => {
                                      const next = { ...previous };
                                      delete next[key];
                                      return next;
                                    })}
                                    className="h-8 p-1 rounded"
                                    style={{ color: 'hsl(var(--ui-muted-foreground))' }}
                                  >
                                    <X size={12} />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[12px]" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>只读权限，无法修改映射</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
          <p className="text-[11px] mt-2" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
            提示：名称/前缀相似的候选仅供参考（匹配度百分比），系统不会自动确认；冲突项（如元仓同码与历史映射矛盾）必须人工裁决后才能参与计算。保存映射后结果将标记为过期，需重新计算。
            {site && ` 站点级映射会同步到补货V2（${site}）。`}
          </p>
        </div>
      )}
    </section>
  );
}
