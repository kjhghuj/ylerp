import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Trash2, Loader2, Search, Store, Calendar, PackageCheck, X } from 'lucide-react';
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
  getApiErrorCode,
  getApiErrorDetail,
  uploadDailyReport,
} from './services/productAnalysisApi';
import {
  ProductAnalysisParseError,
  resolveDailyUploadDate,
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
import { PotentialFiltersPanel } from './components/PotentialFiltersPanel';
import { useProductAnalysisStrings } from './i18n';
import {
  DEFAULT_POTENTIAL_FILTERS,
  type AggResponse,
  type DayMeta,
  type PotentialFilters,
  type PotentialResponse,
  type SelectedItemDescriptor,
  type SheetKey,
  type ShopMeta,
} from './types';

const SEARCH_DEBOUNCE_MS = 300;
const POTENTIAL_FILTERS_STORAGE_KEY = 'yl-pa-potential-filters';
/** 与后端 MAX_QUERY_RANGE_DAYS 对齐：查询区间封顶，防止无界拉取 */
const MAX_QUERY_RANGE_DAYS = 366;

/** 从 localStorage 恢复筛选条件；仅缺失/非法字段回退默认值——合法的 null（不限）必须原样保留 */
export const loadPotentialFilters = (): PotentialFilters => {
  try {
    const raw = localStorage.getItem(POTENTIAL_FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_POTENTIAL_FILTERS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const threshold = (value: unknown): number | null | undefined => {
      if (value === null) return null; // 合法 null = 不限，不能被默认阈值覆盖
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
      return undefined; // 缺失/非法 → 回退默认
    };
    const minCtrPercent = threshold(parsed.minCtrPercent);
    const minClicks = threshold(parsed.minClicks);
    const minCartRatePercent = threshold(parsed.minCartRatePercent);
    return {
      minCtrPercent: minCtrPercent === undefined ? DEFAULT_POTENTIAL_FILTERS.minCtrPercent : minCtrPercent,
      minClicks: minClicks === undefined ? DEFAULT_POTENTIAL_FILTERS.minClicks : minClicks,
      minCartRatePercent: minCartRatePercent === undefined ? DEFAULT_POTENTIAL_FILTERS.minCartRatePercent : minCartRatePercent,
      excludeBannedDeleted:
        typeof parsed.excludeBannedDeleted === 'boolean'
          ? parsed.excludeBannedDeleted
          : DEFAULT_POTENTIAL_FILTERS.excludeBannedDeleted,
      limit:
        typeof parsed.limit === 'number' && Number.isFinite(parsed.limit) && parsed.limit >= 1
          ? parsed.limit
          : DEFAULT_POTENTIAL_FILTERS.limit,
    };
  } catch {
    // 损坏的本地存储安全回退为默认值
    return DEFAULT_POTENTIAL_FILTERS;
  }
};

type ContentTab = 'list' | 'potential';

interface ProductAnalysisProps {
  /** 「生成补货建议」入口：携带当前店铺与区间跳转到补货工作台（补货V3） */
  onGenerateRestock?: (shopId: string, from: string, to: string) => void;
}

export const ProductAnalysis: React.FC<ProductAnalysisProps> = ({ onGenerateRestock }) => {
  const { showToast } = useToast();
  const strings = useProductAnalysisStrings();
  const { user } = useAuth();
  // 与 AiChatPanel 的 aiChat 权限判断同构：owner 直通，未加载完成（!user）先放行
  const hasUploadPermission =
    !user || user.role === 'owner' || hasPermission(user.permissions || [], 'product-analysis.upload');

  const [shops, setShops] = useState<ShopMeta[]>([]);
  const [activeShopId, setActiveShopId] = useState('');
  // 日历数据绑定所属店铺：切店/加载/失败期间不展示其他店铺的日期，删除操作也只针对数据归属店铺
  const [daysState, setDaysState] = useState<{ shopId: string; days: DayMeta[] } | null>(null);
  const [isDaysLoading, setIsDaysLoading] = useState(false);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [contentTab, setContentTab] = useState<ContentTab>('list');
  const [agg, setAgg] = useState<AggResponse | null>(null);
  const [aggError, setAggError] = useState<string | null>(null);
  const [aggErrorCode, setAggErrorCode] = useState<string | null>(null);
  const [isLoadingAgg, setIsLoadingAgg] = useState(false);
  // 新品榜结果绑定完整查询标识（店铺|区间|筛选）：loading 隐藏旧榜单，失败仅展示错误与重试
  const [potentialView, setPotentialView] = useState<
    | { key: string; status: 'loading' }
    | { key: string; status: 'success'; response: PotentialResponse }
    | { key: string; status: 'error'; detail: string }
    | null
  >(null);
  const [potentialRetryToken, setPotentialRetryToken] = useState(0);
  // 潜力商品筛选：draft 承接面板输入，防抖后提交为 potentialFilters 并触发重新拉取
  const [potentialFilters, setPotentialFilters] = useState<PotentialFilters>(loadPotentialFilters);
  const [potentialFiltersDraft, setPotentialFiltersDraft] = useState<PotentialFilters>(potentialFilters);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [shopManagerOpen, setShopManagerOpen] = useState(false);
  // 写入后的统一刷新令牌：上传/删除成功后自增，日历与统计类请求据此重拉，
  // 解决「区间依赖未变化时页面保留旧数据」的问题（同日重传、删除非最新日等场景）
  const [dataRefreshToken, setDataRefreshToken] = useState(0);
  // 操作发起时的店铺 ID 以 ref 固定当前选中店铺，防止异步回调里读到过期选中态
  const activeShopIdRef = useRef(activeShopId);
  useEffect(() => {
    activeShopIdRef.current = activeShopId;
  }, [activeShopId]);

  const [activeSheetKey, setActiveSheetKey] = useState<SheetKey>('hot');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<ProductSortKey>('salesOrdered');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [listPage, setListPage] = useState(1);
  // 详情入口只携带最小展示信息：详情弹窗自行请求数据，不依赖聚合接口先成功
  const [selectedItem, setSelectedItem] = useState<SelectedItemDescriptor | null>(null);

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

  // 日历：店铺切换 / 写入刷新时拉取。数据绑定所属店铺；请求期间切店（含切回）的过期响应直接丢弃；
  // 失败时清空数据并保留错误状态——绝不让其他店铺的旧日期继续可删
  useEffect(() => {
    if (!activeShopId) {
      setDaysState(null);
      setIsDaysLoading(false);
      setDaysError(null);
      return;
    }
    let isCancelled = false;
    const shopIdAtRequest = activeShopId;
    setIsDaysLoading(true);
    setDaysError(null);
    (async () => {
      try {
        const list = await fetchShopDays(shopIdAtRequest);
        if (isCancelled || activeShopIdRef.current !== shopIdAtRequest) return;
        setDaysState({ shopId: shopIdAtRequest, days: list });
      } catch (error) {
        if (isCancelled || activeShopIdRef.current !== shopIdAtRequest) return;
        setDaysState(null);
        setDaysError(getApiErrorDetail(error));
      } finally {
        if (!isCancelled && activeShopIdRef.current === shopIdAtRequest) setIsDaysLoading(false);
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShopId, dataRefreshToken]);

  // 渲染口径：仅当数据归属当前店铺时才展示；否则视为加载中（旧数据立即隐藏）
  const daysBelongToActiveShop = daysState !== null && daysState.shopId === activeShopId;
  const days = daysBelongToActiveShop ? daysState.days : [];
  const isCalendarLoading = isDaysLoading || (daysState !== null && !daysBelongToActiveShop);
  // 币种异常排查（仅提示人工处理）：当前店铺日期列表中币种与店铺币种不一致的记录
  const currencyMismatchedDays = activeShop
    ? days.filter((day) => day.currency && day.currency !== activeShop.currency)
    : [];

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

  // 商品聚合：区间 / 店铺 / 写入刷新变化时拉取（与新品榜解耦，改筛选不重复请求聚合）
  useEffect(() => {
    if (!activeShopId) {
      setAgg(null);
      setAggError(null);
      setAggErrorCode(null);
      return;
    }
    let isCancelled = false;
    setIsLoadingAgg(true);
    (async () => {
      try {
        const aggResponse = await fetchShopAgg(activeShopId, range.from, range.to);
        if (isCancelled) return;
        setAgg(aggResponse);
        setAggError(null);
        setAggErrorCode(null);
        setActiveSheetKey(aggResponse.sheets[0]?.sheetKey ?? 'hot');
      } catch (error) {
        if (!isCancelled) {
          setAggError(getApiErrorDetail(error));
          setAggErrorCode(getApiErrorCode(error));
        }
      } finally {
        if (!isCancelled) setIsLoadingAgg(false);
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShopId, range.from, range.to, dataRefreshToken]);

  // 新品榜：额外依赖筛选条件，与聚合分开加载和报错。结果绑定完整查询标识（店铺|区间|筛选）。
  // 状态机：loading（旧榜单隐藏）→ success（展示） / error（仅错误+重试）。
  // 同一查询的写入后刷新同样走 loading：刷新失败不展示旧榜单（可能已是已删除数据）。
  const potentialQueryKey = activeShopId
    ? `${activeShopId}|${range.from}|${range.to}|${JSON.stringify(potentialFilters)}`
    : '';
  useEffect(() => {
    if (!activeShopId) {
      setPotentialView(null);
      return;
    }
    const queryKey = `${activeShopId}|${range.from}|${range.to}|${JSON.stringify(potentialFilters)}`;
    let isCancelled = false;
    setPotentialView({ key: queryKey, status: 'loading' });
    (async () => {
      try {
        const potentialResponse = await fetchPotential(activeShopId, range.from, range.to, potentialFilters);
        if (isCancelled) return;
        setPotentialView({ key: queryKey, status: 'success', response: potentialResponse });
      } catch (error) {
        if (!isCancelled) setPotentialView({ key: queryKey, status: 'error', detail: getApiErrorDetail(error) });
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShopId, range.from, range.to, potentialFilters, dataRefreshToken, potentialRetryToken]);

  // 渲染口径：状态绑定当前查询标识；标识不匹配（请求即将/正在发出）按加载中处理，绝不渲染旧查询结果
  const potentialViewForCurrentQuery =
    potentialView?.key === potentialQueryKey ? potentialView : ({ status: 'loading' } as const);

  // 筛选输入防抖：停止输入后提交，持久化并触发上方 effect 重新拉取
  useEffect(() => {
    const timer = setTimeout(() => setPotentialFilters(potentialFiltersDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [potentialFiltersDraft]);

  useEffect(() => {
    try {
      localStorage.setItem(POTENTIAL_FILTERS_STORAGE_KEY, JSON.stringify(potentialFilters));
    } catch {
      // 存储配额/隐私模式失败时静默降级为会话内生效
    }
  }, [potentialFilters]);

  /** 写入操作后的统一刷新：先刷新店铺元信息（latestUploadDate/dayCount），
   *  再自增刷新令牌驱动 日历 / 聚合 / 新品榜 重拉；刷新失败显式报错，不把旧数据当最新 */
  const refreshAfterWrite = React.useCallback(async (): Promise<void> => {
    try {
      await refreshShops();
    } catch (error) {
      showToast(strings.refreshFailed.replace('{detail}', getApiErrorDetail(error)), 'error');
    }
    setDataRefreshToken((token) => token + 1);
  }, [refreshShops, showToast, strings]);

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
    const spanDays = Math.round(
      (new Date(`${customTo}T00:00:00.000Z`).getTime() - new Date(`${customFrom}T00:00:00.000Z`).getTime()) / 86_400_000
    ) + 1;
    if (spanDays > MAX_QUERY_RANGE_DAYS) {
      showToast(strings.rangeTooLong.replace('{days}', String(MAX_QUERY_RANGE_DAYS)), 'error');
      return;
    }
    setRangePreset('custom');
  };

  // 批量上传：逐个文件按文件名识别的日期入库（无手选日期，识别不到或多日区间的跳过并提示原因）
  const handleFilesSelected = async (files: File[]) => {
    // 固定操作发起时的店铺：批量过程中切换店铺，文件仍入库到原店铺，且不会用旧店铺数据覆盖当前店铺状态
    const shopIdAtStart = activeShopId;
    if (!shopIdAtStart || files.length === 0) return;
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
          const resolution = resolveDailyUploadDate(file.name);
          if (resolution.status === 'rejected') {
            failCount += 1;
            const toast = resolution.reason === 'multi-day'
              ? strings.rangeReportRejected
                  .replace('{start}', resolution.periodStart ?? '?')
                  .replace('{end}', resolution.periodEnd ?? '?')
                  .replace('{name}', file.name)
              : resolution.reason === 'inverted'
                ? strings.rangeReportInverted
                    .replace('{start}', resolution.periodStart ?? '?')
                    .replace('{end}', resolution.periodEnd ?? '?')
                    .replace('{name}', file.name)
                : resolution.reason === 'invalid'
                  ? strings.rangeReportInvalid.replace('{name}', file.name)
                  : strings.fileNameDateMissing.replace('{name}', file.name);
            showToast(toast, 'error');
            continue;
          }
          const buffer = await file.arrayBuffer();
          const parsed = await parseProductAnalysisWorkbookAsync(buffer, file.name);
          const created = await uploadDailyReport(shopIdAtStart, resolution.date, parsed);
          okCount += 1;
          if (files.length === 1) singleToast = `${resolution.date} · ${created.itemCount} ${strings.resultCount}`;
        } catch (error) {
          failCount += 1;
          const message =
            error instanceof ProductAnalysisParseError ? error.message : getApiErrorDetail(error);
          showToast(`${file.name}：${message}`, 'error');
        }
      }
      // 部分成功也要刷新成功写入的数据（okCount > 0 即刷新）
      if (okCount > 0) {
        await refreshAfterWrite();
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
    // 删除目标 = 展示日历所属店铺；数据尚未加载/已过期/归属其他店铺时禁止操作（防止误删新店数据）
    const calendarShopId = daysBelongToActiveShop ? daysState!.shopId : null;
    if (!calendarShopId || calendarShopId !== activeShopIdRef.current) return;
    if (!window.confirm(`${strings.dayDeleteConfirm}\n（${date}）`)) return;
    try {
      await deleteDailyUpload(calendarShopId, date);
      await refreshAfterWrite();
      showToast(`${date} ${strings.deleteDay} ✓`);
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    }
  };

  const handleBatchDeleteDays = async (dates: string[]) => {
    const calendarShopId = daysBelongToActiveShop ? daysState!.shopId : null;
    if (!calendarShopId || calendarShopId !== activeShopIdRef.current || dates.length === 0) return;
    try {
      const deletedCount = await batchDeleteDailyUploads(calendarShopId, dates);
      await refreshAfterWrite();
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
            {onGenerateRestock && activeShopId && (
              <button
                type="button"
                onClick={() => {
                  onGenerateRestock(activeShopId, range.from, range.to);
                }}
                disabled={!activeShop?.latestUploadDate}
                title={activeShop?.latestUploadDate
                  ? `带当前店铺与区间（${range.from} ~ ${range.to}）进入补货工作台`
                  : '该店铺还没有上传数据，无法生成补货建议'}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-colors duration-200 disabled:opacity-40"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <PackageCheck size={12} />
                生成补货建议
              </button>
            )}
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

        {/* 数据日历：数据绑定所属店铺——加载中 / 加载失败 / 数据属于其他店铺时隐藏日历，
            使单日与批量删除入口不可达，避免用旧店铺的日期误删新店铺数据 */}
        <div className="flex-1 min-h-0">
          {isCalendarLoading ? (
            <div
              className="h-full rounded-2xl border flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
              role="status"
              aria-label="calendar-loading"
            >
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
          ) : daysError ? (
            <div
              className="h-full rounded-2xl border flex flex-col items-center justify-center gap-2 text-xs text-center px-4"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'rgba(220,38,38,0.35)', color: '#b91c1c' }}
              role="alert"
            >
              <AlertTriangle size={18} />
              <span className="break-all">{daysError}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{strings.calendarLoadFailed}</span>
            </div>
          ) : hasAnyData ? (
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

            {contentTab === 'potential' ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
                <PotentialFiltersPanel
                  value={potentialFiltersDraft}
                  onChange={setPotentialFiltersDraft}
                  onReset={() => setPotentialFiltersDraft(DEFAULT_POTENTIAL_FILTERS)}
                />
                {potentialViewForCurrentQuery.status === 'error' ? (
                  <div
                    className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs"
                    style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.35)', color: '#b91c1c' }}
                  >
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    {/* 失败（含同查询写入后刷新失败）仅展示错误与重试，不回退旧榜单 */}
                    <span className="break-all">{strings.refreshFailed.replace('{detail}', potentialViewForCurrentQuery.detail)}</span>
                    <button
                      type="button"
                      onClick={() => setPotentialRetryToken((token) => token + 1)}
                      className="ml-auto shrink-0 font-medium underline"
                    >
                      {strings.potential.retry}
                    </button>
                  </div>
                ) : potentialViewForCurrentQuery.status === 'loading' ? (
                  <div className="flex-1 flex items-center justify-center py-10">
                    <Loader2 size={26} className="animate-spin" style={{ color: 'var(--primary)' }} />
                  </div>
                ) : (
                  <PotentialList
                    items={potentialViewForCurrentQuery.response.items}
                    onSelect={(item) => {
                      setSelectedItem({ itemId: item.itemId, itemName: item.itemName });
                    }}
                  />
                )}
              </div>
            ) : isLoadingAgg ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={26} className="animate-spin" style={{ color: 'var(--primary)' }} />
              </div>
            ) : aggError ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
                <div
                  className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm"
                  style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.35)', color: '#b91c1c' }}
                >
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span className="break-all">{strings.refreshFailed.replace('{detail}', aggError)}</span>
                </div>
                {/* 币种异常排查：复用日历的日期列表（含上传币种/文件名），只提示人工处理，不自动删除/改标签/换算 */}
                {aggErrorCode === 'CURRENCY_MISMATCH' && activeShop && (
                  <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {strings.currencyAuditTitle.replace('{currency}', activeShop.currency)}
                    </p>
                    <div className="flex flex-col gap-1.5 text-xs">
                      {currencyMismatchedDays.length > 0 ? (
                        currencyMismatchedDays.map((day) => (
                          <div key={day.date} className="flex flex-wrap items-center gap-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            <span style={{ color: '#b45309' }}>{day.date}</span>
                            <span>{day.currency}</span>
                            <span className="truncate" style={{ color: 'var(--text-tertiary)' }} title={day.fileName}>{day.fileName}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>{strings.currencyAuditEmpty}</span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      {strings.currencyAuditHint}
                    </p>
                  </div>
                )}
              </div>
            ) : agg && agg.sheets.length > 0 ? (
              summary && activeSheet ? (
                <>
                  <SummaryCards summary={summary} currency={agg.currency} weightedCvr={activeSheet?.summary?.weightedCvr ?? null} />
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <ProductList
                      items={filteredItems}
                      currency={agg.currency}
                      page={listPage}
                      onPageChange={setListPage}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSortChange={handleSortChange}
                      onSelect={(item) => setSelectedItem({ itemId: item.itemId, itemName: item.itemName, status: item.status })}
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
          itemId={selectedItem.itemId}
          itemName={selectedItem.itemName}
          status={selectedItem.status}
          from={range.from}
          to={range.to}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};
