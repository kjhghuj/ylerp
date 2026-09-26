import React, { useEffect, useMemo, useRef, useState } from 'react';
import './product-analysis.css';
import { AlertTriangle, Loader2, Search, Store, PackageCheck, X, FileSpreadsheet, CloudDownload } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../AuthContext';
import { hasPermission } from '../../components/PermissionTree';
import { UploadZone } from './components/UploadZone';
import { CalendarPanel } from './components/CalendarPanel';
import { SummaryCards } from './components/SummaryCards';
import { OverviewCards } from './components/OverviewCards';
import { EstablishedTrendCard, NewPotentialCard } from './components/OverviewInsights';
import { ProductList, type ProductSortKey } from './components/ProductList';
import { PotentialList } from './components/PotentialList';
import { ShopManager } from './components/ShopManager';
import { CollectionModal } from './components/CollectionModal';
import { fetchCollectionRun, listCollectionRuns } from './services/collectionApi';
import { ThemeMenu } from './components/ThemeMenu';
import { PaThemeProvider, usePaTheme } from './themeContext';
import { ProductDetailModal } from './modals/ProductDetailModal';
import {
  batchDeleteDailyUploads,
  deleteDailyUpload,
  fetchEstablishedTrends,
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
import { overviewPageSize } from './utils/overviewPageSize';
import {
  DEFAULT_POTENTIAL_FILTERS,
  type AggResponse,
  type DayMeta,
  type EstablishedTrendsResponse,
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
const OVERVIEW_RANKING_LIMIT = 100;

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

/** 四个页面视图：概览 / 商品列表 / 潜力商品 / 数据日历 */
type ViewKey = 'overview' | 'list' | 'potential' | 'calendar';
const VIEW_KEYS: ViewKey[] = ['overview', 'list', 'potential', 'calendar'];

interface ProductAnalysisProps {
  /** 「生成补货建议」入口：携带当前店铺与区间跳转到补货工作台（补货V3） */
  onGenerateRestock?: (shopId: string, from: string, to: string) => void;
}

export const ProductAnalysis: React.FC<ProductAnalysisProps> = ({ onGenerateRestock }) => (
  <PaThemeProvider>
    <ProductAnalysisViews onGenerateRestock={onGenerateRestock} />
  </PaThemeProvider>
);

const ProductAnalysisViews: React.FC<ProductAnalysisProps> = ({ onGenerateRestock }) => {
  const { showToast } = useToast();
  const strings = useProductAnalysisStrings();
  const { theme } = usePaTheme();
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
  const [view, setView] = useState<ViewKey>('overview');
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
  const [establishedView, setEstablishedView] = useState<
    | { key: string; status: 'loading' }
    | { key: string; status: 'success'; response: EstablishedTrendsResponse }
    | { key: string; status: 'error'; detail: string }
    | null
  >(null);
  const [establishedRetryToken, setEstablishedRetryToken] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const insightsRef = useRef<HTMLDivElement>(null);
  const [overviewRowsPerPage, setOverviewRowsPerPage] = useState(1);
  useEffect(() => {
    if (view !== 'overview' || isInitialLoading || isLoadingAgg || aggError) return;
    const card = insightsRef.current?.firstElementChild as HTMLElement | null;
    if (!card) return;
    const update = () => setOverviewRowsPerPage(overviewPageSize(card.getBoundingClientRect().height));
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(card);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [view, isInitialLoading, isLoadingAgg, aggError, agg]);
  // 潜力商品筛选：draft 承接面板输入，防抖后提交为 potentialFilters 并触发重新拉取
  const [potentialFilters, setPotentialFilters] = useState<PotentialFilters>(loadPotentialFilters);
  const [potentialFiltersDraft, setPotentialFiltersDraft] = useState<PotentialFilters>(potentialFilters);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [shopManagerOpen, setShopManagerOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
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
  // 接口当前按日期倒序返回；这里仍统一排序，兼容缓存或测试传入的其它顺序。
  const newestDays = useMemo(() => [...days].sort((a, b) => b.date.localeCompare(a.date)), [days]);
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
    ? `${activeShopId}|${range.from}|${range.to}|${JSON.stringify(potentialFilters)}|${dataRefreshToken}`
    : '';
  useEffect(() => {
    if (!activeShopId) {
      setPotentialView(null);
      return;
    }
    const queryKey = `${activeShopId}|${range.from}|${range.to}|${JSON.stringify(potentialFilters)}|${dataRefreshToken}`;
    let isCancelled = false;
    setPotentialView({ key: queryKey, status: 'loading' });
    (async () => {
      try {
        const potentialResponse = await fetchPotential(activeShopId, range.from, range.to, {
          ...potentialFilters, limit: OVERVIEW_RANKING_LIMIT,
        });
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

  const establishedQueryKey = activeShopId ? `${activeShopId}|${range.from}|${range.to}|${dataRefreshToken}` : '';
  useEffect(() => {
    if (!activeShopId) {
      setEstablishedView(null);
      return;
    }
    const queryKey = `${activeShopId}|${range.from}|${range.to}|${dataRefreshToken}`;
    let cancelled = false;
    setEstablishedView({ key: queryKey, status: 'loading' });
    (async () => {
      try {
        const response = await fetchEstablishedTrends(activeShopId, range.from, range.to);
        if (!cancelled) setEstablishedView({ key: queryKey, status: 'success', response });
      } catch (error) {
        if (!cancelled) setEstablishedView({ key: queryKey, status: 'error', detail: getApiErrorDetail(error) });
      }
    })();
    return () => { cancelled = true; };
  }, [activeShopId, range.from, range.to, dataRefreshToken, establishedRetryToken]);
  const establishedViewForCurrentQuery =
    establishedView?.key === establishedQueryKey ? establishedView : ({ status: 'loading' } as const);

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
  const onCollectionImported = React.useCallback(() => { void refreshAfterWrite(); }, [refreshAfterWrite]);
  const collectionCounts = useRef<Record<string,number>>({});
  useEffect(() => {
    if (!activeShopId || !hasUploadPermission) return;
    let live = true;
    const check = async () => {
      try {
        const runs = await listCollectionRuns(activeShopId);
        const current = runs.find(run => ['ACTIVE','PAUSED','STARTING'].includes(run.status)) || runs[0];
        if (!current) return;
        const data = await fetchCollectionRun(activeShopId,current.id,1);
        if (!live) return;
        const count = data.batch?.counts.IMPORTED || 0;
        const previous = collectionCounts.current[current.id] || 0;
        collectionCounts.current[current.id] = count;
        if (count > previous) void refreshAfterWrite();
      } catch { /* 弹窗中会显示可操作的错误 */ }
    };
    void check(); const timer = window.setInterval(() => void check(), 15_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [activeShopId, hasUploadPermission, refreshAfterWrite]);

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
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--pa-accent, var(--primary))' }} />
      </div>
    );
  }

  const hasAnyData = days.length > 0;
  const emptyHint = activeShopId ? strings.noData : strings.shop.emptyHint;
  const emptyBox = (
    <div className="pa-empty flex-1" role="status">
      {emptyHint}
    </div>
  );

  /** 数据日历卡片（概览紧凑版与数据日历视图共用；批量管理/删除功能保持一致） */
  const renderCalendarCard = () => {
    if (isCalendarLoading) {
      return (
        <div className="pa-card pa-calendar-state" role="status" aria-label="calendar-loading">
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--pa-accent-text)' }} />
        </div>
      );
    }
    if (daysError) {
      return (
        <div
          className="pa-card pa-calendar-state flex-col gap-2 text-xs text-center px-4"
          style={{ borderColor: 'rgba(220,38,38,0.35)', color: '#b91c1c' }}
          role="alert"
        >
          <AlertTriangle size={18} />
          <span className="break-all">{daysError}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{strings.calendarLoadFailed}</span>
        </div>
      );
    }
    if (hasAnyData) {
      return (
        <CalendarPanel
          key={activeShopId}
          days={days}
          canDelete={hasUploadPermission}
          onDeleteDay={(date) => void handleDeleteDay(date)}
          onBatchDelete={(dates) => void handleBatchDeleteDays(dates)}
        />
      );
    }
    return (
      <div className="pa-card pa-calendar-state text-xs text-center px-4" style={{ color: 'var(--text-tertiary)' }}>
        {strings.noData}
      </div>
    );
  };

  /** 聚合接口错误横幅 + 币种异常排查卡（保留原有处理逻辑） */
  const renderAggError = () => (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm"
        style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.35)', color: '#b91c1c' }}
      >
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
        <span className="break-all">{strings.refreshFailed.replace('{detail}', aggError ?? '')}</span>
      </div>
      {/* 币种异常排查：复用日历的日期列表（含上传币种/文件名），只提示人工处理，不自动删除/改标签/换算 */}
      {aggErrorCode === 'CURRENCY_MISMATCH' && activeShop && (
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--pa-card)', borderColor: 'var(--pa-card-border)' }}>
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
  );

  const sheetChips = (agg?.sheets ?? []).map((sheet) => {
    const isActive = sheet.sheetKey === activeSheetKey;
    return (
      <button
        key={sheet.sheetKey}
        type="button"
        onClick={() => setActiveSheetKey(sheet.sheetKey)}
        aria-pressed={isActive}
        className="pa-chip"
      >
        {strings.sheets[sheet.sheetKey] || sheet.sheetKey}（{sheet.items.length}）
      </button>
    );
  });

  /** 概览视图：核心指标与两个按可用高度分页的榜单。 */
  const renderOverview = () => {
    if (isLoadingAgg) return (
      <div className="pa-card flex items-center justify-center" style={{ minHeight: 180 }} role="status">
        <Loader2 size={26} className="animate-spin" style={{ color: 'var(--pa-accent-text)' }} />
      </div>
    );
    if (aggError) return renderAggError();
    if (!agg || agg.sheets.length === 0 || !summary || !activeSheet) return emptyBox;
    return (
      <div className="pa-ov-grid">
        <div className="pa-list-toolbar">{sheetChips}</div>
        <OverviewCards summary={summary} currency={agg.currency} effectiveSummary={activeSheet.summary ?? null} />
        <div ref={insightsRef} className="pa-ov-insights">
          <NewPotentialCard
            pageSize={overviewRowsPerPage}
            state={potentialViewForCurrentQuery.status === 'success'
              ? { status: 'success', data: potentialViewForCurrentQuery.response.items }
              : potentialViewForCurrentQuery}
            onRetry={() => setPotentialRetryToken((token) => token + 1)}
            onMore={() => setView('potential')}
            onSelect={(item) => setSelectedItem({ itemId: item.itemId, itemName: item.itemName })}
          />
          <EstablishedTrendCard
            pageSize={overviewRowsPerPage}
            state={establishedViewForCurrentQuery.status === 'success'
              ? { status: 'success', data: establishedViewForCurrentQuery.response }
              : establishedViewForCurrentQuery}
            onRetry={() => setEstablishedRetryToken((token) => token + 1)}
            onSelect={(item) => setSelectedItem({ itemId: item.itemId, itemName: item.itemName })}
          />
        </div>
      </div>
    );
  };

  /** 商品列表视图：汇总卡 + sheet 切换 + 搜索排序 + 分页表格 */
  const renderList = () => (
    <>
      {isLoadingAgg ? (
        <div className="pa-card flex-1 flex items-center justify-center" role="status">
          <Loader2 size={26} className="animate-spin" style={{ color: 'var(--pa-accent-text)' }} />
        </div>
      ) : aggError ? (
        renderAggError()
      ) : agg && agg.sheets.length > 0 ? (
        summary && activeSheet ? (
          <>
            <SummaryCards summary={summary} currency={agg.currency} weightedCvr={activeSheet?.summary?.weightedCvr ?? null} />
            <div className="pa-list-toolbar">
              {sheetChips}
              <div className="pa-search flex items-center gap-2 min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder={strings.searchPlaceholder}
                    className="pa-chip w-full rounded-full pl-8 pr-3 py-2 text-sm"
                    style={{
                      backgroundColor: 'var(--pa-card)',
                      borderColor: 'var(--pa-card-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                  {filteredItems.length} {strings.resultCount}
                </span>
              </div>
            </div>
            <div className="pa-list-slot">
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
      ) : (
        emptyBox
      )}
    </>
  );

  /** 潜力商品视图：筛选面板 + 榜单（状态绑定查询标识） */
  const renderPotential = () => (
    <div className="pa-report-scroll flex flex-col gap-3">
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
          <Loader2 size={26} className="animate-spin" style={{ color: 'var(--pa-accent-text)' }} />
        </div>
      ) : (
        <PotentialList
          items={potentialViewForCurrentQuery.response.items.slice(0, potentialFilters.limit)}
          onSelect={(item) => {
            setSelectedItem({ itemId: item.itemId, itemName: item.itemName });
          }}
        />
      )}
    </div>
  );

  /** 数据日历视图：上传 + 完整日历 + 数据记录表 */
  const renderCalendarView = () => (
    <div className="pa-calendar-view">
      <div className="pa-calendar-col">
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
        {activeShopId ? renderCalendarCard() : emptyBox}
      </div>
      <div className="pa-card pa-records-card">
        <div className="pa-card-head">
          <h3 className="pa-card-title">{strings.overview.recordsTitle}</h3>
          <span className="pa-card-sub">
            {activeShop ? `${activeShop.name} · ${activeShop.dayCount} ${strings.shop.dayUnit}` : ''}
          </span>
        </div>
        {days.length === 0 ? (
          <div className="pa-chart-empty" role="status">{emptyHint}</div>
        ) : (
          <div className="pa-records-scroll">
            <table className="pa-records">
              <thead>
                <tr>
                  <th>{strings.overview.recordsColumns.date}</th>
                  <th>{strings.overview.recordsColumns.file}</th>
                  <th>{strings.overview.recordsColumns.items}</th>
                  <th>{strings.overview.recordsColumns.currency}</th>
                  <th>{strings.overview.recordsColumns.version}</th>
                  <th>{strings.overview.recordsColumns.createdAt}</th>
                </tr>
              </thead>
              <tbody>
                {newestDays.map((day) => (
                  <tr key={day.date}>
                    <td className="pa-records-date">{day.date}</td>
                    <td title={day.fileName}>
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <FileSpreadsheet size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'bottom' }}>
                          {day.fileName}
                        </span>
                      </span>
                    </td>
                    <td>{day.itemCount}</td>
                    <td>{day.currency}</td>
                    <td>v{day.version ?? 1}</td>
                    <td title={day.createdAt}>{day.createdAt.slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {currencyMismatchedDays.length > 0 && (
          <p className="text-[11px]" style={{ color: '#b45309' }}>
            ⚠ {currencyMismatchedDays.map((day) => day.date).join('、')} {activeShop ? `≠ ${activeShop.currency}` : ''}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className={`pa-shell${view === 'overview' ? ' pa-shell-overview' : ''}`} style={theme.cssVars as React.CSSProperties}>
      {/* 工具栏：店铺与操作（左） + 主题颜色菜单（右上角） */}
      <div className="pa-toolbar">
        <div className="pa-toolbar-group">
          {shops.length > 0 ? (
            <>
              <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }} htmlFor="shop-select">
                {strings.shop.label}
              </label>
              <select
                id="shop-select"
                value={activeShopId}
                onChange={(event) => setActiveShopId(event.target.value)}
                className="pa-shop-select truncate"
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}（{shop.site}）
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{strings.shop.emptyHint}</span>
          )}
          <button type="button" onClick={() => setShopManagerOpen(true)} className="pa-btn pa-btn-ghost">
            <Store size={13} />
            {strings.shop.manage}
          </button>
          {activeShop && hasUploadPermission && <button type="button" onClick={() => setCollectionOpen(true)} className="pa-btn pa-btn-ghost">
            <CloudDownload size={13} />采集店铺数据
          </button>}
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
              className="pa-btn pa-btn-accent"
            >
              <PackageCheck size={13} />
              生成补货建议
            </button>
          )}
          {activeShop && (
            <span className="pa-shop-meta truncate">
              {activeShop.latestUploadDate
                ? `${strings.shop.latest} ${activeShop.latestUploadDate} · ${activeShop.dayCount} ${strings.shop.dayUnit}`
                : strings.noData}
            </span>
          )}
        </div>
        <div className="pa-toolbar-spacer" />
        <ThemeMenu />
      </div>

      {/* 视图导航（左） + 日期区间筛选（右） */}
      <nav className="pa-viewbar" aria-label={strings.views.overview}>
        <div className="pa-view-tabs">
          {VIEW_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setView(key)}
              className="pa-view-tab"
            >
              {strings.views[key]}
            </button>
          ))}
        </div>
        {activeShopId && (
          <div className="pa-viewbar-right">
            {(['7d', '30d', '90d'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRangePreset(preset)}
                aria-pressed={rangePreset === preset}
                className="pa-chip"
              >
                {preset === '7d' ? strings.date.last7 : preset === '30d' ? strings.date.last30 : strings.date.last90}
              </button>
            ))}
            {rangePreset === 'custom' ? (
              <div className="pa-custom-range">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="pa-chip text-xs"
                  style={{ color: 'var(--text-primary)' }}
                />
                <span style={{ color: 'var(--text-tertiary)' }}>~</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="pa-chip text-xs"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button type="button" onClick={handleApplyCustomRange} className="pa-chip" aria-pressed>
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
                className="pa-chip"
              >
                {strings.date.custom}
              </button>
            )}
            <span className="pa-range-label">
              {range.from} ~ {range.to}
            </span>
          </div>
        )}
      </nav>

      {/* 视图内容 */}
      <div className={`pa-view-body${view === 'overview' ? ' pa-view-body-overview' : ''}`}>
        {view === 'overview' && (activeShopId ? renderOverview() : emptyBox)}
        {view === 'list' && (activeShopId && hasAnyData ? renderList() : emptyBox)}
        {view === 'potential' && (activeShopId && hasAnyData ? renderPotential() : emptyBox)}
        {view === 'calendar' && renderCalendarView()}
      </div>

      {shopManagerOpen && (
        <ShopManager
          shops={shops}
          onClose={() => setShopManagerOpen(false)}
          onRefresh={handleShopsChanged}
        />
      )}
      {collectionOpen && activeShop && <CollectionModal key={activeShop.id} shop={activeShop}
        onClose={() => setCollectionOpen(false)} onImported={onCollectionImported} />}

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
