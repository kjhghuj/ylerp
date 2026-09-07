import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trash2, Loader2, Search, Store, Calendar, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../AuthContext';
import { hasPermission } from '../../components/PermissionTree';
import { UploadZone } from './components/UploadZone';
import { CalendarPanel } from './components/CalendarPanel';
import { SummaryCards } from './components/SummaryCards';
import { ProductList, type ProductSortKey } from './components/ProductList';
import { PotentialList } from './components/PotentialList';
import { ShopManager } from './components/ShopManager';
import { ProductDetailModal } from './modals/ProductDetailModal';
import {
  batchDeleteDailyUploads,
  deleteDailyUpload,
  fetchPotential,
  fetchShopAgg,
  fetchShopDays,
  fetchShops,
  getApiErrorDetail,
  uploadDailyReport,
} from './services/productAnalysisApi';
import {
  ProductAnalysisParseError,
  detectDailyDateFromFileName,
  validateProductAnalysisFile,
} from './utils/excelParser';
import { parseProductAnalysisWorkbookAsync } from './utils/excelWorkerClient';
import {
  buildSearchHaystacks,
  filterAndSortItems,
  summarizeSheet,
  type SortDirection,
} from './utils/format';
import {
  defaultUploadDate,
  isValidDateString,
  presetToDays,
  resolveQuickRange,
  type RangePreset,
} from './utils/range';
import { useProductAnalysisStrings } from './i18n';
import type { AggregatedItem, AggResponse, DayMeta, PotentialResponse, SheetKey, ShopMeta } from './types';

const SEARCH_DEBOUNCE_MS = 300;

type ContentTab = 'list' | 'potential';

export const ProductAnalysis: React.FC = () => {
  const { showToast } = useToast();
  const strings = useProductAnalysisStrings();
  const { user } = useAuth();
  // 与 AiChatPanel 的 aiChat 权限判断同构：owner 直通，未加载完成（!user）先放行
  const hasUploadPermission =
    !user || user.role === 'owner' || hasPermission(user.permissions || [], 'product-analysis.upload');

  const [shops, setShops] = useState<ShopMeta[]>([]);
  const [activeShopId, setActiveShopId] = useState('');
  const [days, setDays] = useState<DayMeta[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [contentTab, setContentTab] = useState<ContentTab>('list');
  const [agg, setAgg] = useState<AggResponse | null>(null);
  const [potential, setPotential] = useState<PotentialResponse | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [shopManagerOpen, setShopManagerOpen] = useState(false);

  const [activeSheetKey, setActiveSheetKey] = useState<SheetKey>('hot');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<ProductSortKey>('salesOrdered');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [listPage, setListPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<AggregatedItem | null>(null);

  const activeShop = useMemo(
    () => shops.find((shop) => shop.id === activeShopId) ?? null,
    [shops, activeShopId]
  );

  const refreshShops = React.useCallback(async (): Promise<ShopMeta[]> => {
    const list = await fetchShops();
    setShops(list);
    return list;
  }, []);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const list = await fetchShops();
        if (isCancelled) return;
        setShops(list);
        if (list.length > 0) setActiveShopId((current) => current || list[0].id);
      } catch (error) {
        if (!isCancelled) showToast(getApiErrorDetail(error), 'error');
      } finally {
        if (!isCancelled) setIsInitialLoading(false);
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 店铺切换：拉取已上传日列表
  useEffect(() => {
    if (!activeShopId) {
      setDays([]);
      return;
    }
    let isCancelled = false;
    (async () => {
      try {
        const list = await fetchShopDays(activeShopId);
        if (!isCancelled) setDays(list);
      } catch (error) {
        if (!isCancelled) showToast(getApiErrorDetail(error), 'error');
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShopId]);

  // 快捷区间以最新上传日为锚点；自定义区间直接使用所选日期
  const range = useMemo(() => {
    if (rangePreset === 'custom' && isValidDateString(customFrom) && isValidDateString(customTo) && customFrom <= customTo) {
      return { from: customFrom, to: customTo };
    }
    const latest = activeShop?.latestUploadDate;
    const anchor = latest ?? defaultUploadDate();
    const days = presetToDays(rangePreset);
    if (days) return resolveQuickRange(anchor, days);
    return resolveQuickRange(anchor, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset, customFrom, customTo, activeShop?.latestUploadDate, days.length]);

  // 区间变化：并行拉取聚合商品与潜力榜
  useEffect(() => {
    if (!activeShopId) {
      setAgg(null);
      setPotential(null);
      return;
    }
    let isCancelled = false;
    setIsLoadingData(true);
    (async () => {
      try {
        const [aggResponse, potentialResponse] = await Promise.all([
          fetchShopAgg(activeShopId, range.from, range.to),
          fetchPotential(activeShopId, range.from, range.to),
        ]);
        if (isCancelled) return;
        setAgg(aggResponse);
        setPotential(potentialResponse);
        setActiveSheetKey(aggResponse.sheets[0]?.sheetKey ?? 'hot');
      } catch (error) {
        if (!isCancelled) showToast(getApiErrorDetail(error), 'error');
      } finally {
        if (!isCancelled) setIsLoadingData(false);
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShopId, range.from, range.to]);

  const handleShopsChanged = async () => {
    const list = await refreshShops();
    if (!list.some((shop) => shop.id === activeShopId)) {
      setActiveShopId(list[0]?.id ?? '');
    }
  };

  const handleApplyCustomRange = () => {
    if (!isValidDateString(customFrom) || !isValidDateString(customTo) || customFrom > customTo) {
      showToast(strings.date.invalid, 'error');
      return;
    }
    setRangePreset('custom');
  };

  // 批量上传：逐个文件按文件名识别的日期入库（无手选日期，识别不到的跳过并提示）
  const handleFilesSelected = async (files: File[]) => {
    if (!activeShopId || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(files.length > 1 ? { current: 0, total: files.length } : null);
    let okCount = 0;
    let failCount = 0;
    let singleToast = '';
    try {
      for (const [index, file] of files.entries()) {
        if (files.length > 1) setUploadProgress({ current: index + 1, total: files.length });
        try {
          validateProductAnalysisFile(file);
          const effectiveDate = detectDailyDateFromFileName(file.name);
          if (!effectiveDate) {
            failCount += 1;
            showToast(strings.fileNameDateMissing.replace('{name}', file.name), 'error');
            continue;
          }
          const buffer = await file.arrayBuffer();
          const parsed = await parseProductAnalysisWorkbookAsync(buffer, file.name);
          const created = await uploadDailyReport(activeShopId, effectiveDate, parsed);
          okCount += 1;
          if (files.length === 1) singleToast = `${effectiveDate} · ${created.itemCount} ${strings.resultCount}`;
        } catch (error) {
          failCount += 1;
          const message =
            error instanceof ProductAnalysisParseError ? error.message : getApiErrorDetail(error);
          showToast(`${file.name}：${message}`, 'error');
        }
      }
      if (okCount > 0) {
        const [dayList, shopList] = await Promise.all([fetchShopDays(activeShopId), refreshShops()]);
        setDays(dayList);
        // 同日重传后 latestUploadDate 可能前移，区间 effect 依赖 latestUploadDate 会自动重载
        void shopList;
        showToast(
          files.length > 1
            ? strings.batchUploadSummary.replace('{ok}', String(okCount)).replace('{fail}', String(failCount))
            : singleToast
        );
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteDay = async (date: string) => {
    if (!activeShopId) return;
    if (!window.confirm(`${strings.dayDeleteConfirm}\n（${date}）`)) return;
    try {
      await deleteDailyUpload(activeShopId, date);
      const [dayList] = await Promise.all([fetchShopDays(activeShopId), refreshShops()]);
      setDays(dayList);
      showToast(`${date} ${strings.deleteDay} ✓`);
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    }
  };

  const handleBatchDeleteDays = async (dates: string[]) => {
    if (!activeShopId || dates.length === 0) return;
    try {
      const deletedCount = await batchDeleteDailyUploads(activeShopId, dates);
      const [dayList] = await Promise.all([fetchShopDays(activeShopId), refreshShops()]);
      setDays(dayList);
      showToast(strings.batchDeletedToast.replace('{count}', String(deletedCount)));
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    }
  };

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 切换筛选条件时回到第一页
  useEffect(() => {
    setListPage(1);
  }, [activeShopId, range.from, range.to, activeSheetKey, debouncedSearch, sortKey, sortDirection]);

  // 列头点击排序：同列在降/升间切换，换列重置为降序
  const handleSortChange = (key: ProductSortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const activeSheet = useMemo(
    () => agg?.sheets.find((sheet) => sheet.sheetKey === activeSheetKey) ?? null,
    [agg, activeSheetKey]
  );
  const summary = useMemo(
    () => (activeSheet
      ? summarizeSheet({ sheetKey: activeSheet.sheetKey, sheetName: activeSheet.sheetKey, columns: [], items: activeSheet.items })
      : null),
    [activeSheet]
  );
  // 检索索引随 sheet 构建一次，后续键入只做 includes，不再全量重复 toLowerCase
  const searchHaystacks = useMemo(
    () => (activeSheet ? buildSearchHaystacks(activeSheet.items) : []),
    [activeSheet]
  );
  const filteredItems = useMemo(() => {
    if (!activeSheet) return [];
    return filterAndSortItems(activeSheet.items, searchHaystacks, debouncedSearch, sortKey, sortDirection);
  }, [activeSheet, searchHaystacks, debouncedSearch, sortKey, sortDirection]);

  /** 潜力榜点击 → 详情弹窗（同一区间内一定能从聚合结果找到对应商品） */
  const findAggregatedItem = (itemId: string): AggregatedItem | null => {
    for (const sheet of agg?.sheets ?? []) {
      const found = sheet.items.find((item) => item.itemId === itemId);
      if (found) return found;
    }
    return null;
  };

  if (isInitialLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  const hasAnyData = days.length > 0;
  const emptyBox = (
    <div
      className="flex-1 rounded-2xl border flex items-center justify-center text-sm"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
    >
      {activeShopId ? strings.noData : strings.shop.emptyHint}
    </div>
  );

  return (
    <div className="h-full flex gap-4 min-h-0">
      {/* 左栏：店铺 + 上传 + 数据日历 */}
      <aside className="w-72 shrink-0 flex flex-col gap-3 min-h-0">
        <div
          className="rounded-2xl border p-3 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }} htmlFor="shop-select">
              {strings.shop.label}
            </label>
            {shops.length > 0 ? (
              <select
                id="shop-select"
                value={activeShopId}
                onChange={(event) => setActiveShopId(event.target.value)}
                className="flex-1 min-w-0 rounded-lg border px-2 py-1 text-sm truncate"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)',
                }}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}（{shop.site}）
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{strings.shop.emptyHint}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShopManagerOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors duration-200"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            >
              <Store size={12} />
              {strings.shop.manage}
            </button>
            {activeShop && (
              <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                {activeShop.latestUploadDate
                  ? `${strings.shop.latest} ${activeShop.latestUploadDate} · ${activeShop.dayCount} ${strings.shop.dayUnit}`
                  : strings.noData}
              </span>
            )}
          </div>
        </div>

        {activeShopId && (
          <UploadZone
            onFilesSelected={handleFilesSelected}
            isUploading={isUploading}
            disabled={!hasUploadPermission}
            uploadingLabel={
              uploadProgress
                ? strings.uploadingProgress
                    .replace('{current}', String(uploadProgress.current))
                    .replace('{total}', String(uploadProgress.total))
                : undefined
            }
          />
        )}

        {/* 数据日历：展示每天是否已上传（切店重挂载，回到最新上传月） */}
        <div className="flex-1 min-h-0">
          {hasAnyData ? (
            <CalendarPanel
              key={activeShopId}
              days={days}
              canDelete={hasUploadPermission}
              onDeleteDay={(date) => void handleDeleteDay(date)}
              onBatchDelete={(dates) => void handleBatchDeleteDays(dates)}
            />
          ) : (
            <div
              className="h-full rounded-2xl border flex items-center justify-center text-xs text-center px-4"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
            >
              {strings.noData}
            </div>
          )}
        </div>
      </aside>

      {/* 主区：日期区间 + 内容 */}
      <section className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        {activeShopId && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(['7d', '30d', '90d'] as const).map((preset) => {
              const active = rangePreset === preset;
              const label = preset === '7d' ? strings.date.last7 : preset === '30d' ? strings.date.last30 : strings.date.last90;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRangePreset(preset)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors duration-200"
                  style={{
                    backgroundColor: active ? 'var(--primary)' : 'var(--bg-card)',
                    borderColor: active ? 'var(--primary)' : 'var(--border-light)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : undefined,
                  }}
                >
                  {label}
                </button>
              );
            })}
            {rangePreset === 'custom' ? (
              <div className="flex items-center gap-1.5">
                <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--primary)', color: 'var(--text-primary)' }}
                />
                <span style={{ color: 'var(--text-tertiary)' }}>~</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--primary)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={handleApplyCustomRange}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
                >
                  {strings.date.apply}
                </button>
                <button
                  type="button"
                  onClick={() => setRangePreset('7d')}
                  className="p-1 rounded-lg"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label="close-custom"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(range.from);
                  setCustomTo(range.to);
                  setRangePreset('custom');
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors duration-200"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-secondary)',
                }}
              >
                {strings.date.custom}
              </button>
            )}
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {range.from} ~ {range.to}
            </span>
          </div>
        )}

        {activeShopId && hasAnyData && (
          <>
            {/* 控制行：内容 tab +（列表页）sheet 切换与搜索合并，压缩纵向空间 */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: 'list', label: strings.tabs.list },
                { key: 'potential', label: strings.tabs.potential },
              ] as const).map(({ key, label }) => {
                const active = contentTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setContentTab(key)}
                    className="px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-colors duration-200"
                    style={{
                      backgroundColor: active ? 'var(--primary)' : 'var(--bg-card)',
                      borderColor: active ? 'var(--primary)' : 'var(--border-light)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      boxShadow: active ? 'var(--shadow-sm)' : undefined,
                    }}
                  >
                    {label}
                  </button>
                );
              })}

              {contentTab === 'list'
                && agg?.sheets.map((sheet) => {
                  const isActive = sheet.sheetKey === activeSheetKey;
                  return (
                    <button
                      key={sheet.sheetKey}
                      type="button"
                      onClick={() => setActiveSheetKey(sheet.sheetKey)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors duration-200"
                      style={{
                        backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-card)',
                        borderColor: isActive ? 'var(--primary)' : 'var(--border-light)',
                        color: isActive ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {strings.sheets[sheet.sheetKey] || sheet.sheetKey}（{sheet.items.length}）
                    </button>
                  );
                })}

              {contentTab === 'list' && activeSheet && (
                <div className="flex items-center gap-2 ml-auto min-w-0">
                  <div className="relative w-52">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={strings.searchPlaceholder}
                      className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-sm"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-light)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {filteredItems.length} {strings.resultCount}
                  </span>
                </div>
              )}
            </div>

            {isLoadingData ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={26} className="animate-spin" style={{ color: 'var(--primary)' }} />
              </div>
            ) : contentTab === 'potential' ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <PotentialList
                  items={potential?.items ?? []}
                  onSelect={(item) => {
                    const aggregated = findAggregatedItem(item.itemId);
                    if (aggregated) setSelectedItem(aggregated);
                  }}
                />
              </div>
            ) : agg && agg.sheets.length > 0 ? (
              summary && activeSheet ? (
                <>
                  <SummaryCards summary={summary} currency={agg.currency} />
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <ProductList
                      items={filteredItems}
                      currency={agg.currency}
                      page={listPage}
                      onPageChange={setListPage}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSortChange={handleSortChange}
                      onSelect={(item) => setSelectedItem(item as AggregatedItem)}
                    />
                  </div>
                </>
              ) : null
            ) : emptyBox}
          </>
        )}

        {(activeShopId && !hasAnyData || !activeShopId) && emptyBox}
      </section>

      {shopManagerOpen && (
        <ShopManager
          shops={shops}
          onClose={() => setShopManagerOpen(false)}
          onRefresh={handleShopsChanged}
        />
      )}

      {selectedItem && activeShopId && (
        <ProductDetailModal
          shopId={activeShopId}
          item={selectedItem}
          from={range.from}
          to={range.to}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};
