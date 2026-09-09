import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clipboard,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Store,
  Warehouse,
} from "lucide-react";
import api from "../src/api";
import {
  rankRestockTargetSkus,
  type RankedRestockTargetSku,
  type RestockTargetSku,
} from "./restock/utils/restockTargetSku";
import { CandidatePicker, sameSku } from "./restock/components/CandidatePicker";

interface RestockShop {
  id: string;
  name: string;
  site: string;
  platform: string;
  currency: string;
  dayCount: number;
  latestUploadDate: string | null;
}

interface ShopSalesRow {
  externalSku: string;
  displaySku: string;
  level: "variation" | "item";
  itemId: string;
  itemName: string;
  variationName: string | null;
  units: number;
  observedDays: number;
  targetSku: string | null;
  mappingStatus: "mapped" | "pending";
}

interface ShopSalesData {
  shop: { id: string; name: string; site: string; currency: string };
  from: string;
  to: string;
  shopObservedDays: number;
  pendingCount: number;
  noSkuVariationCount: number;
  noSkuVariationUnits: number;
  rows: ShopSalesRow[];
}

interface SkuRule {
  sku: string;
  leadTimeDays: number | null;
  safetyDays: number | null;
  growthPercent: number | null;
}

interface RestockPlanItem {
  productId: string;
  name: string;
  sku: string;
  site: string;
  status: "critical" | "warning" | "healthy" | "missing_sales";
  reason: string;
  dailySales: number;
  availableStock: number;
  arrivalDate: string;
  coverageDays: number;
  inTransitBeforeArrival: number;
  inTransitDuringCoverage: number;
  suggestedQty: number;
  warnings: string[];
}

interface RestockPlan {
  generatedAt: string;
  summary: { totalSuggestedQty: number; restockCount: number };
  items: RestockPlanItem[];
  metadata?: {
    statisticsDays?: number;
    observedDays?: number;
    statisticsDaysOverridden?: boolean;
    pendingCount?: number;
    excludedMissingInventoryCount?: number;
    excludedOversizedSkus?: string[];
    noSkuVariationCount?: number;
  };
  integration?: { warnings?: string[]; warehouseCodes?: string[] };
}

type EditableSkuRule = Pick<SkuRule, "leadTimeDays" | "safetyDays" | "growthPercent">;
type TargetSkuDraft = { sku: string; name: string };
type MappingTab = "pending" | "mapped";
type RestockResultSortKey =
  | "sku"
  | "dailySales"
  | "arrivalDate"
  | "availableStock"
  | "inTransit"
  | "suggestedQty";
type SortDirection = "ascending" | "descending";

const MAX_PLANNING_DAYS = 3650;
const MAX_GROWTH_PERCENT = 1000;
const MAPPING_PAGE_SIZE = 50;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (isoDate: string, days: number) => {
  const result = new Date(`${isoDate}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const isValidIsoDate = (value: string) =>
  datePattern.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const formatNumber = (value: number, digits = 0) =>
  Number.isFinite(value)
    ? value.toLocaleString("zh-CN", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
    : "-";
const formatCsvRow = (values: Array<string | number>) =>
  values
    .map((value) => {
      const text = String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
const normalizeTargetSku = (value: string) =>
  value.replace(/\t/g, "").trim().toUpperCase();
const requestStatus = (error: unknown) =>
  error && typeof error === "object" && "response" in error
    ? (error as { response?: { status?: number } }).response?.status
    : undefined;
const friendlyError = (error: unknown, fallback: string) => {
  const status = requestStatus(error);
  if (status === 401) return "登录状态已失效，请重新登录后再试。";
  if (status === 403) return "当前账号没有补货数据权限。";
  if (status === 400) {
    const detail = (error as { response?: { data?: { error?: string } } })
      ?.response?.data?.error;
    if (detail === "No product analysis uploads in this date range")
      return "所选区间内没有商品分析上传数据，请先在商品分析模块上传报表或调整区间。";
    return "提交的数据或日期参数不符合要求，请检查后再试。";
  }
  if (status === 503) return "元仓数据暂不可用，请稍后重新计算。";
  return fallback;
};
const toNullableNumber = (value: string, integer = false): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > MAX_PLANNING_DAYS ||
    (integer && !Number.isInteger(parsed))
    ? null
    : parsed;
};
const statusLabel: Record<RestockPlanItem["status"], string> = {
  critical: "紧急",
  warning: "需补货",
  healthy: "充足",
  missing_sales: "无销量",
};
const statusStyle: Record<RestockPlanItem["status"], string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  healthy: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  missing_sales: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const RestockV3: React.FC = () => {
  const [shops, setShops] = useState<RestockShop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sales, setSales] = useState<ShopSalesData | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [remoteTargetSkus, setRemoteTargetSkus] = useState<RestockTargetSku[]>(
    [],
  );
  const [createdTargetSkus, setCreatedTargetSkus] = useState<
    RestockTargetSku[]
  >([]);
  const [rules, setRules] = useState<SkuRule[]>([]);
  const [ruleEdits, setRuleEdits] = useState<Record<string, EditableSkuRule>>({});
  const [mappingTab, setMappingTab] = useState<MappingTab>("pending");
  const [queueFilter, setQueueFilter] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [mappingSelection, setMappingSelection] = useState<
    Record<string, string>
  >({});
  const [mappingSearch, setMappingSearch] = useState<Record<string, string>>({});
  const [mappingDirty, setMappingDirty] = useState<Record<string, boolean>>({});
  const [creatingTargetFor, setCreatingTargetFor] = useState<
    Record<string, boolean>
  >({});
  const [targetSkuDrafts, setTargetSkuDrafts] = useState<
    Record<string, TargetSkuDraft>
  >({});
  const [savingSku, setSavingSku] = useState("");
  const [creatingSku, setCreatingSku] = useState("");
  const [quickCreatingSku, setQuickCreatingSku] = useState("");
  const [savingRuleSku, setSavingRuleSku] = useState("");
  const [statisticsDaysMode, setStatisticsDaysMode] = useState<
    "auto" | "custom"
  >("auto");
  const [statisticsDaysCustom, setStatisticsDaysCustom] = useState("");
  const [planningDate, setPlanningDate] = useState(todayIso);
  const [leadTimeDays, setLeadTimeDays] = useState(25);
  const [targetDate, setTargetDate] = useState(() => addDays(todayIso(), 90));
  const [safetyDays, setSafetyDays] = useState(30);
  const [growthPercent, setGrowthPercent] = useState(0);
  const [plan, setPlan] = useState<RestockPlan | null>(null);
  const [resultSort, setResultSort] = useState<{
    key: RestockResultSortKey | null;
    direction: SortDirection;
  }>({ key: null, direction: "ascending" });
  const [loading, setLoading] = useState(false);
  const [mutationActive, setMutationActive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const salesLoadTokenRef = useRef(0);
  const mutationLockRef = useRef(false);
  const autoMatchAttemptedRef = useRef<Set<string>>(new Set());
  const selectedShopIdRef = useRef(selectedShopId);
  selectedShopIdRef.current = selectedShopId;

  const selectedShop = shops.find((shop) => shop.id === selectedShopId) || null;
  const targetSkus = useMemo(() => {
    const unique = new Map<string, RestockTargetSku>();
    remoteTargetSkus.forEach((item) => {
      const sku = normalizeTargetSku(String(item.sku || ""));
      if (sku && !unique.has(sku))
        unique.set(sku, { id: String(item.id || sku), sku, name: item.name });
    });
    createdTargetSkus.forEach((item) =>
      unique.set(normalizeTargetSku(item.sku), item),
    );
    return [...unique.values()].sort((left, right) =>
      left.sku.localeCompare(right.sku),
    );
  }, [createdTargetSkus, remoteTargetSkus]);

  const pendingRows = useMemo(
    () => (sales?.rows || []).filter((row) => row.mappingStatus === "pending"),
    [sales],
  );
  const mappedRows = useMemo(
    () => (sales?.rows || []).filter((row) => row.mappingStatus === "mapped"),
    [sales],
  );
  const filteredQueue = useMemo(() => {
    const source = mappingTab === "pending" ? pendingRows : mappedRows;
    const query = queueFilter.trim().toUpperCase();
    if (!query) return source;
    return source.filter((row) =>
      [
        row.externalSku,
        row.displaySku,
        row.itemName,
        row.variationName,
        row.targetSku,
      ].some((value) =>
        String(value || "").toUpperCase().includes(query),
      ),
    );
  }, [mappedRows, mappingTab, pendingRows, queueFilter]);
  const queuePageCount = Math.max(
    1,
    Math.ceil(filteredQueue.length / MAPPING_PAGE_SIZE),
  );
  const visibleQueue = useMemo(() => {
    const start = (queuePage - 1) * MAPPING_PAGE_SIZE;
    return filteredQueue.slice(start, start + MAPPING_PAGE_SIZE);
  }, [filteredQueue, queuePage]);
  const rankedVisibleCandidates = useMemo(() => {
    const ranked = new Map<string, RankedRestockTargetSku[]>();
    if (mappingTab !== "pending") return ranked;
    visibleQueue.forEach((row) => {
      const sourceSku = row.externalSku;
      ranked.set(
        row.externalSku,
        sourceSku.trim()
          ? rankRestockTargetSkus(sourceSku, targetSkus)
          : targetSkus.map((candidate) => ({ ...candidate })),
      );
    });
    return ranked;
  }, [mappingTab, targetSkus, visibleQueue]);
  const effectiveStatisticsDays = useMemo(() => {
    if (statisticsDaysMode === "custom") {
      const parsed = toNullableNumber(statisticsDaysCustom, true);
      return parsed && parsed >= 1 ? parsed : null;
    }
    return sales?.shopObservedDays || null;
  }, [sales, statisticsDaysCustom, statisticsDaysMode]);
  const arrivalDate = useMemo(
    () =>
      isValidIsoDate(planningDate) ? addDays(planningDate, leadTimeDays) : "",
    [leadTimeDays, planningDate],
  );
  const sortedPlanItems = useMemo(() => {
    if (!plan || !resultSort.key) return plan?.items || [];
    const direction = resultSort.direction === "ascending" ? 1 : -1;
    const compare = (left: RestockPlanItem, right: RestockPlanItem) => {
      switch (resultSort.key) {
        case "sku":
          return left.sku.localeCompare(right.sku, "zh-CN", {
            numeric: true,
            sensitivity: "base",
          });
        case "dailySales":
          return left.dailySales - right.dailySales;
        case "arrivalDate": {
          const dateComparison = left.arrivalDate.localeCompare(
            right.arrivalDate,
          );
          return dateComparison || left.coverageDays - right.coverageDays;
        }
        case "availableStock":
          return left.availableStock - right.availableStock;
        case "inTransit":
          return (
            left.inTransitBeforeArrival +
            left.inTransitDuringCoverage -
            right.inTransitBeforeArrival -
            right.inTransitDuringCoverage
          );
        case "suggestedQty":
          return left.suggestedQty - right.suggestedQty;
      }
    };
    return plan.items
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const comparison = compare(left.item, right.item);
        return comparison ? comparison * direction : left.index - right.index;
      })
      .map(({ item }) => item);
  }, [plan, resultSort]);

  const beginMutation = useCallback(() => {
    if (mutationLockRef.current) return false;
    mutationLockRef.current = true;
    setMutationActive(true);
    return true;
  }, []);
  const endMutation = useCallback(() => {
    mutationLockRef.current = false;
    setMutationActive(false);
  }, []);

  const resetWorkbench = useCallback(() => {
    setSales(null);
    setPlan(null);
    setMappingSelection({});
    setMappingSearch({});
    setMappingDirty({});
    setCreatingTargetFor({});
    setTargetSkuDrafts({});
    setRuleEdits({});
    setRules([]);
    setQueueFilter("");
    setMappingTab("pending");
    setQueuePage(1);
    setResultSort({ key: null, direction: "ascending" });
    setCreatedTargetSkus([]);
    setStatisticsDaysMode("auto");
    setStatisticsDaysCustom("");
    autoMatchAttemptedRef.current = new Set();
  }, []);

  const loadShops = useCallback(async () => {
    setShopsLoading(true);
    setError("");
    try {
      const response = await api.get("/restock-v3/shops");
      setShops(response.data as RestockShop[]);
    } catch (requestError) {
      setError(friendlyError(requestError, "店铺列表加载失败。"));
    } finally {
      setShopsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  // 选中店铺：默认统计区间 = 最新上传日往前 30 天（不足则从首个可用日开始由用户调整）
  useEffect(() => {
    resetWorkbench();
    if (!selectedShop) {
      setFromDate("");
      setToDate("");
      return;
    }
    if (selectedShop.latestUploadDate) {
      setToDate(selectedShop.latestUploadDate);
      setFromDate(addDays(selectedShop.latestUploadDate, -29));
    } else {
      setFromDate("");
      setToDate("");
    }
  }, [resetWorkbench, selectedShop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTargetSkus = useCallback(async () => {
    try {
      const response = await api.get("/restock-v3/target-skus");
      setRemoteTargetSkus(
        (response.data as { items: RestockTargetSku[] }).items || [],
      );
    } catch {
      // 候选加载失败不阻塞主流程，保存映射时后端仍会校验
    }
  }, []);

  const loadRules = useCallback(async (shopId: string) => {
    try {
      const response = await api.get("/restock-v3/sku-rules", {
        params: { shopId },
      });
      setRules((response.data as { rules: SkuRule[] }).rules || []);
    } catch {
      setRules([]);
    }
  }, []);

  const loadSales = useCallback(
    async (shopId: string, from: string, to: string) => {
      if (!shopId || !isValidIsoDate(from) || !isValidIsoDate(to) || from > to)
        return;
      const loadToken = ++salesLoadTokenRef.current;
      setSalesLoading(true);
      setError("");
      try {
        const response = await api.get(
          `/restock-v3/shops/${shopId}/sales`,
          { params: { from, to } },
        );
        if (
          loadToken !== salesLoadTokenRef.current ||
          selectedShopIdRef.current !== shopId
        )
          return;
        setSales(response.data as ShopSalesData);
        setQueuePage(1);
        setMappingTab("pending");
      } catch (requestError) {
        if (
          loadToken !== salesLoadTokenRef.current ||
          selectedShopIdRef.current !== shopId
        )
          return;
        setSales(null);
        setError(friendlyError(requestError, "店铺销量加载失败。"));
      } finally {
        if (loadToken === salesLoadTokenRef.current) setSalesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedShopId) return;
    void loadSales(selectedShopId, fromDate, toDate);
    void loadTargetSkus();
    void loadRules(selectedShopId);
  }, [fromDate, loadRules, loadSales, loadTargetSkus, selectedShopId, toDate]);

  const reloadSales = useCallback(
    async (shopId: string, from: string, to: string) => {
      await loadSales(shopId, from, to);
    },
    [loadSales],
  );

  const saveMapping = async (
    row: ShopSalesRow,
    targetSku: string,
    options: { silent?: boolean } = {},
  ) => {
    if (!selectedShop) return false;
    if (!beginMutation()) return false;
    const requestShopId = selectedShop.id;
    if (!options.silent) setSavingSku(row.externalSku);
    if (!options.silent) setError("");
    try {
      await api.put("/restock-v3/mapping", {
        shopId: requestShopId,
        externalSku: row.externalSku,
        targetSku,
      });
      if (selectedShopIdRef.current !== requestShopId) return true;
      setMappingDirty((previous) => {
        const next = { ...previous };
        delete next[row.externalSku];
        return next;
      });
      if (!options.silent) {
        setNotice(`${row.displaySku} 的映射已保存。`);
        await reloadSales(requestShopId, fromDate, toDate);
      }
      return true;
    } catch (requestError) {
      if (selectedShopIdRef.current === requestShopId && !options.silent) {
        setError(friendlyError(requestError, "保存映射失败。"));
      }
      return false;
    } finally {
      if (!options.silent) setSavingSku("");
      endMutation();
    }
  };

  // 自动匹配：唯一 100% 命中的候选静默保存（与 V2 行为一致；精确同名的映射后端本就视为已映射）
  useEffect(() => {
    if (mappingTab !== "pending" || !sales || targetSkus.length === 0) return;
    const exactMatches = visibleQueue
      .filter(
        (row) =>
          row.mappingStatus === "pending" &&
          !autoMatchAttemptedRef.current.has(row.externalSku) &&
          !mappingDirty[row.externalSku],
      )
      .map((row) => {
        const candidates = rankedVisibleCandidates.get(row.externalSku) || [];
        const exact = candidates.filter(
          (candidate) => candidate.matchPercentage === 100,
        );
        return { row, candidate: exact.length === 1 ? exact[0] : null };
      })
      .filter((entry): entry is { row: ShopSalesRow; candidate: RankedRestockTargetSku } =>
        Boolean(entry.candidate),
      );
    if (exactMatches.length === 0) return;
    exactMatches.forEach(({ row }) =>
      autoMatchAttemptedRef.current.add(row.externalSku),
    );
    let cancelled = false;
    void (async () => {
      for (const { row, candidate } of exactMatches) {
        if (cancelled || selectedShopIdRef.current !== sales.shop.id) {
          cancelled = true;
          break;
        }
        const saved = await saveMapping(row, candidate.sku, { silent: true });
        if (!saved) break;
      }
      if (!cancelled && selectedShopIdRef.current === sales.shop.id) {
        await reloadSales(sales.shop.id, sales.from, sales.to);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedVisibleCandidates, sales, targetSkus, visibleQueue]);

  const getTargetSkuDraft = (key: string): TargetSkuDraft =>
    targetSkuDrafts[key] || { sku: "", name: "" };
  const cancelTargetSkuCreation = (key: string) => {
    setCreatingTargetFor((previous) => ({ ...previous, [key]: false }));
    setTargetSkuDrafts((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };
  const createTargetSku = async (row: ShopSalesRow) => {
    const draft = getTargetSkuDraft(row.externalSku);
    const sku = normalizeTargetSku(draft.sku);
    if (!sku || !selectedShop) {
      setError("请填写新建本地 SKU。");
      return;
    }
    if (!beginMutation()) return;
    const requestSite = selectedShop.site;
    setCreatingSku(row.externalSku);
    setError("");
    try {
      const response = await api.post("/restock-v3/target-skus", {
        site: requestSite,
        sku,
        name: draft.name.trim() || sku,
      });
      if (selectedShopIdRef.current !== selectedShop.id) return;
      const created = response.data as RestockTargetSku;
      setCreatedTargetSkus((previous) => [
        ...previous.filter((current) => !sameSku(current.sku, created.sku)),
        created,
      ]);
      setMappingSelection((previous) => ({
        ...previous,
        [row.externalSku]: created.sku,
      }));
      setMappingDirty((previous) => ({ ...previous, [row.externalSku]: true }));
      cancelTargetSkuCreation(row.externalSku);
      setNotice("本地 SKU 已创建并选中；请继续保存映射。");
      void loadTargetSkus();
    } catch (requestError) {
      if (selectedShopIdRef.current === selectedShop.id) {
        setError(friendlyError(requestError, "创建本地 SKU 失败。"));
      }
    } finally {
      setCreatingSku("");
      endMutation();
    }
  };
  const quickCreateTargetSkuAndSaveMapping = async (row: ShopSalesRow) => {
    const sku = normalizeTargetSku(row.externalSku || "");
    if (!selectedShop || !sku) {
      setError("当前记录缺少平台 SKU，无法快速新建并保存映射。");
      return;
    }
    if (!beginMutation()) return;
    const requestShopId = selectedShop.id;
    const requestSite = selectedShop.site;
    let availableSku =
      targetSkus.find((candidate) => sameSku(candidate.sku, sku)) || null;
    setQuickCreatingSku(row.externalSku);
    setError("");
    try {
      if (!availableSku) {
        try {
          const response = await api.post("/restock-v3/target-skus", {
            site: requestSite,
            sku,
            name: sku,
          });
          availableSku = response.data as RestockTargetSku;
        } catch (requestError) {
          if (requestStatus(requestError) !== 409) throw requestError;
          availableSku = { id: `existing-${sku}`, sku, name: sku };
        }
      }
      const created = availableSku;
      setCreatedTargetSkus((previous) => [
        ...previous.filter((current) => !sameSku(current.sku, created.sku)),
        created,
      ]);
      await api.put("/restock-v3/mapping", {
        shopId: requestShopId,
        externalSku: row.externalSku,
        targetSku: sku,
      });
      if (selectedShopIdRef.current !== requestShopId) return;
      autoMatchAttemptedRef.current.add(row.externalSku);
      setMappingSelection((previous) => {
        const next = { ...previous };
        delete next[row.externalSku];
        return next;
      });
      setMappingDirty((previous) => {
        const next = { ...previous };
        delete next[row.externalSku];
        return next;
      });
      setNotice(`已按平台 SKU ${sku} 快速新建并保存映射。`);
      void loadTargetSkus();
      await reloadSales(requestShopId, fromDate, toDate);
    } catch (requestError) {
      if (selectedShopIdRef.current === requestShopId) {
        setError(friendlyError(requestError, "快速新建并保存映射失败。"));
      }
    } finally {
      setQuickCreatingSku("");
      endMutation();
    }
  };

  const getRuleEdit = (sku: string): EditableSkuRule => {
    const saved = rules.find((rule) => sameSku(rule.sku, sku));
    const edit = ruleEdits[normalizeTargetSku(sku)];
    return {
      leadTimeDays: edit?.leadTimeDays !== undefined ? edit.leadTimeDays : saved?.leadTimeDays ?? null,
      safetyDays: edit?.safetyDays !== undefined ? edit.safetyDays : saved?.safetyDays ?? null,
      growthPercent: edit?.growthPercent !== undefined ? edit.growthPercent : saved?.growthPercent ?? null,
    };
  };
  const updateRuleEdit = (
    sku: string,
    field: keyof EditableSkuRule,
    value: number | null,
  ) => {
    setRuleEdits((previous) => ({
      ...previous,
      [normalizeTargetSku(sku)]: {
        leadTimeDays: null,
        safetyDays: null,
        growthPercent: null,
        ...getRuleEdit(sku),
        [field]: value,
      },
    }));
  };
  const saveRule = async (sku: string, reset = false) => {
    if (!selectedShop) return;
    if (!beginMutation()) return;
    const requestShopId = selectedShop.id;
    setSavingRuleSku(sku);
    setError("");
    try {
      const edit = reset
        ? { leadTimeDays: null, safetyDays: null, growthPercent: null }
        : getRuleEdit(sku);
      await api.put(`/restock-v3/sku-rules/${encodeURIComponent(sku)}`, {
        shopId: requestShopId,
        leadTimeDays: edit.leadTimeDays,
        safetyDays: edit.safetyDays,
        growthPercent: edit.growthPercent,
      });
      if (selectedShopIdRef.current !== requestShopId) return;
      setRuleEdits((previous) => {
        const next = { ...previous };
        delete next[normalizeTargetSku(sku)];
        return next;
      });
      await loadRules(requestShopId);
      setNotice(reset ? `已恢复 ${sku} 的默认参数。` : `${sku} 的规则已保存。`);
    } catch (requestError) {
      if (selectedShopIdRef.current === requestShopId) {
        setError(friendlyError(requestError, "保存规则失败。"));
      }
    } finally {
      setSavingRuleSku("");
      endMutation();
    }
  };

  const calculatePlan = async () => {
    if (!selectedShop || !sales) return;
    if (
      !isValidIsoDate(planningDate) ||
      !isValidIsoDate(targetDate) ||
      !isValidIsoDate(fromDate) ||
      !isValidIsoDate(toDate)
    ) {
      setError("请检查日期参数。");
      return;
    }
    if (
      leadTimeDays < 0 ||
      leadTimeDays > MAX_PLANNING_DAYS ||
      safetyDays < 0 ||
      safetyDays > MAX_PLANNING_DAYS ||
      growthPercent < 0 ||
      growthPercent > MAX_GROWTH_PERCENT ||
      targetDate <= arrivalDate
    ) {
      setError(
        "请检查补货时效、安全库存和增长率；目标覆盖日必须晚于到仓日。",
      );
      return;
    }
    const statisticsDays =
      statisticsDaysMode === "custom"
        ? toNullableNumber(statisticsDaysCustom, true)
        : sales.shopObservedDays;
    if (!statisticsDays || statisticsDays < 1) {
      setError("统计天数需为不小于 1 的整数（自动模式取区间内实际上传天数）。");
      return;
    }
    if (!beginMutation()) return;
    const requestShopId = selectedShop.id;
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/restock-v3/recommendations", {
        shopId: requestShopId,
        from: fromDate,
        to: toDate,
        planningDate,
        targetDate,
        leadTimeDays,
        safetyDays,
        growthPercent,
        ...(statisticsDaysMode === "custom" ? { statisticsDays } : {}),
      });
      if (selectedShopIdRef.current !== requestShopId) return;
      setPlan(response.data as RestockPlan);
      setResultSort({ key: null, direction: "ascending" });
    } catch (requestError) {
      if (selectedShopIdRef.current === requestShopId) {
        setError(friendlyError(requestError, "补货建议计算失败。"));
      }
    } finally {
      setLoading(false);
      endMutation();
    }
  };

  const copyPlan = async () => {
    if (!sortedPlanItems.length || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(
      sortedPlanItems
        .map((item) => `${item.sku}\t${item.suggestedQty}`)
        .join("\n"),
    );
    setNotice("补货建议已复制。");
  };
  const exportPlan = () => {
    if (!sortedPlanItems.length || !selectedShop) return;
    const lines = [
      formatCsvRow([
        "本地 SKU",
        "状态",
        "日销",
        "到仓日 / 覆盖天数",
        "元仓可用",
        "在途(到仓前/覆盖期)",
        "最终数量",
        "提示",
      ]),
      ...sortedPlanItems.map((item) =>
        formatCsvRow([
          item.sku,
          statusLabel[item.status],
          formatNumber(item.dailySales, 2),
          `${item.arrivalDate} / ${item.coverageDays}`,
          formatNumber(item.availableStock),
          `${formatNumber(item.inTransitBeforeArrival)} / ${formatNumber(item.inTransitDuringCoverage)}`,
          formatNumber(item.suggestedQty),
          item.warnings?.join("；") || "",
        ]),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `补货建议_${selectedShop.name}_${planningDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sortableResultHeader = (
    key: RestockResultSortKey,
    label: string,
  ) => {
    const active = resultSort.key === key;
    const SortIcon = active
      ? resultSort.direction === "ascending"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
    return (
      <th
        className="p-2"
        aria-sort={active ? resultSort.direction : undefined}
      >
        <button
          type="button"
          aria-label={`按${label}排序`}
          onClick={() =>
            setResultSort((previous) => ({
              key,
              direction:
                previous.key === key && previous.direction === "ascending"
                  ? "descending"
                  : "ascending",
            }))
          }
          className="inline-flex items-center gap-1 font-medium transition hover:text-slate-900"
        >
          {label}
          <SortIcon size={12} />
        </button>
      </th>
    );
  };

  const renderQueueRow = (row: ShopSalesRow) => {
    const selection =
      mappingSelection[row.externalSku] ?? row.targetSku ?? "";
    const ranked = mappingTab === "pending"
      ? rankedVisibleCandidates.get(row.externalSku) || []
      : [];
    const search = mappingSearch[row.externalSku] || "";
    const compactQuery = search.trim().toUpperCase();
    const candidates = compactQuery
      ? ranked.filter((candidate) =>
          candidate.sku.includes(compactQuery.replace(/\s+/g, "")),
        )
      : ranked;
    const selectedCandidate = selection
      ? targetSkus.find((candidate) => sameSku(candidate.sku, selection)) ||
        null
      : null;
    const dirty = Boolean(mappingDirty[row.externalSku]);
    const creating = Boolean(creatingTargetFor[row.externalSku]);
    const draft = getTargetSkuDraft(row.externalSku);
    return (
      <tr
        key={row.externalSku}
        className="border-b border-slate-100 align-middle"
      >
        <td className="p-2">
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">
              {row.displaySku}
            </span>
            {row.level === "item" ? (
              <span className="text-[11px] text-amber-600">
                无变体数据，按商品整体件数
              </span>
            ) : null}
          </div>
        </td>
        <td className="p-2">
          <div className="flex flex-col">
            <span className="max-w-[16rem] truncate text-sm text-slate-700">
              {row.itemName}
            </span>
            {row.variationName ? (
              <span className="text-[11px] text-slate-400">
                {row.variationName}
              </span>
            ) : null}
          </div>
        </td>
        <td className="p-2 tabular-nums">
          <span className="font-semibold">{formatNumber(row.units)}</span>
          <span className="ml-1 text-[11px] text-slate-400">
            / {row.observedDays} 天
          </span>
        </td>
        <td className="p-2">
          {mappingTab === "pending" ? (
            creating ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    aria-label="新建本地 SKU 编号"
                    placeholder="SKU 编号"
                    value={draft.sku}
                    onChange={(event) =>
                      setTargetSkuDrafts((previous) => ({
                        ...previous,
                        [row.externalSku]: {
                          ...draft,
                          sku: event.target.value,
                        },
                      }))
                    }
                    className="h-9 w-40 rounded-lg border border-slate-300 px-2 text-sm"
                  />
                  <input
                    aria-label="新建本地 SKU 名称"
                    placeholder="名称（可选）"
                    value={draft.name}
                    onChange={(event) =>
                      setTargetSkuDrafts((previous) => ({
                        ...previous,
                        [row.externalSku]: {
                          ...draft,
                          name: event.target.value,
                        },
                      }))
                    }
                    className="h-9 w-48 rounded-lg border border-slate-300 px-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => createTargetSku(row)}
                    disabled={mutationActive}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {creatingSku === row.externalSku ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    创建并选中
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelTargetSkuCreation(row.externalSku)}
                    className="h-8 rounded-lg border border-slate-300 px-3 text-xs transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CandidatePicker
                    itemId={row.externalSku}
                    candidates={candidates}
                    selectedSku={selection}
                    selectedCandidate={selectedCandidate || undefined}
                    onChange={(sku) => {
                      setMappingSelection((previous) => ({
                        ...previous,
                        [row.externalSku]: sku,
                      }));
                      setMappingDirty((previous) => ({
                        ...previous,
                        [row.externalSku]: true,
                      }));
                    }}
                  />
                  <div className="relative">
                    <Search
                      size={13}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      aria-label="筛选候选 SKU"
                      placeholder="筛选候选"
                      value={search}
                      onChange={(event) =>
                        setMappingSearch((previous) => ({
                          ...previous,
                          [row.externalSku]: event.target.value,
                        }))
                      }
                      className="h-10 w-36 rounded-lg border border-slate-300 pl-7 pr-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveMapping(row, selection)}
                    disabled={!selection || !dirty || mutationActive}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingSku === row.externalSku ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    保存映射
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCreatingTargetFor((previous) => ({
                        ...previous,
                        [row.externalSku]: true,
                      }))
                    }
                    disabled={mutationActive}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={12} />
                    新建本地 SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => quickCreateTargetSkuAndSaveMapping(row)}
                    disabled={mutationActive}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {quickCreatingSku === row.externalSku ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    快速新建并映射
                  </button>
                </div>
              </div>
            )
          ) : (
            <span className="text-sm font-semibold text-emerald-700">
              {row.targetSku}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const step = !selectedShop ? 1 : sales ? (pendingRows.length ? 2 : plan ? 4 : 3) : 1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-900">补货V3 · 店铺补货</h2>
        <p className="text-sm text-slate-500">
          从商品分析店铺取订单件数作为销量，结合元仓该店铺站点的仓储数据计算补货建议；SKU 映射与参数规则和补货V2 互通。
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          <RefreshCw size={14} />
          {notice}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-blue-600">步骤 1</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              选择店铺与统计区间
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void loadShops()}
            disabled={shopsLoading}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={shopsLoading ? "animate-spin" : ""} />
            刷新店铺
          </button>
        </div>
        {shopsLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            正在加载店铺…
          </div>
        ) : shops.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            还没有商品分析店铺；请先在「商品分析」模块创建店铺并上传每日报表。
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,20rem)_auto_auto] sm:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">
                商品分析店铺
              </span>
              <div className="relative">
                <Store
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  aria-label="选择商品分析店铺"
                  value={selectedShopId}
                  onChange={(event) => setSelectedShopId(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm font-medium"
                >
                  <option value="">请选择店铺</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}（{shop.site}）
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">开始日期</span>
              <input
                type="date"
                aria-label="统计区间开始日期"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">结束日期</span>
              <input
                type="date"
                aria-label="统计区间结束日期"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
          </div>
        )}
        {selectedShop ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              站点 <b className="text-slate-700">{selectedShop.site}</b>
            </span>
            <span>
              币种 <b className="text-slate-700">{selectedShop.currency}</b>
            </span>
            <span>
              累计上传 <b className="text-slate-700">{selectedShop.dayCount}</b> 天
            </span>
            {selectedShop.latestUploadDate ? (
              <span>
                最新数据 <b className="text-slate-700">{selectedShop.latestUploadDate}</b>
              </span>
            ) : null}
            {sales ? (
              <span>
                区间内实际上传{" "}
                <b className="text-slate-700">{sales.shopObservedDays}</b> 天
              </span>
            ) : null}
            {sales && sales.noSkuVariationCount > 0 ? (
              <span className="text-amber-600">
                有 {sales.noSkuVariationCount} 个规格缺少 SKU 编号（
                {formatNumber(sales.noSkuVariationUnits)} 件），无法参与映射
              </span>
            ) : null}
          </div>
        ) : null}
        {salesLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            正在聚合店铺销量…
          </div>
        ) : null}
      </section>

      {selectedShop && sales ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600">步骤 2</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">
                SKU 映射
                <span className="ml-2 text-sm font-normal text-slate-500">
                  待映射 {pendingRows.length} · 已映射 {mappedRows.length}
                </span>
              </h3>
            </div>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                aria-label="筛选映射列表"
                placeholder="按 SKU / 商品名筛选"
                value={queueFilter}
                onChange={(event) => {
                  setQueueFilter(event.target.value);
                  setQueuePage(1);
                }}
                className="h-9 w-56 rounded-lg border border-slate-300 pl-7 pr-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {(["pending", "mapped"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMappingTab(tab);
                  setQueuePage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  mappingTab === tab
                    ? "bg-slate-800 text-white"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab === "pending" ? "待映射" : "已映射"}
              </button>
            ))}
          </div>
          {filteredQueue.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {mappingTab === "pending"
                ? "没有待映射的 SKU，可以直接计算补货建议。"
                : "还没有已映射的 SKU。"}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table
                aria-label="SKU 映射工作台"
                className="min-w-[900px] w-full text-sm"
              >
                <thead className="border-b text-left text-slate-500">
                  <tr>
                    <th className="p-2">平台 SKU</th>
                    <th className="p-2">商品 / 规格</th>
                    <th className="p-2">件数 / 观测天数</th>
                    <th className="p-2">
                      {mappingTab === "pending" ? "映射操作" : "本地 SKU"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQueue.map((row) => renderQueueRow(row))}
                </tbody>
              </table>
              {queuePageCount > 1 ? (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    第 {queuePage} / {queuePageCount} 页（共{" "}
                    {filteredQueue.length} 条）
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQueuePage((page) => page - 1)}
                      disabled={queuePage <= 1}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setQueuePage((page) => Math.min(page + 1, queuePageCount))
                      }
                      disabled={queuePage >= queuePageCount}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {mappingTab === "mapped" && mappedRows.length > 0 ? (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-bold text-slate-700">
                SKU 规则覆盖（留空使用全局参数）
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table
                  aria-label="SKU 规则覆盖"
                  className="min-w-[640px] w-full text-sm"
                >
                  <thead className="border-b bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="p-2">本地 SKU</th>
                      <th className="p-2">补货时效（天）</th>
                      <th className="p-2">安全库存（天）</th>
                      <th className="p-2">增长率（%）</th>
                      <th className="p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set(mappedRows.map((row) => row.targetSku || "")),
                    )
                      .filter(Boolean)
                      .map((sku) => {
                        const edit = getRuleEdit(sku);
                        return (
                          <tr key={sku} className="border-b border-slate-100">
                            <td className="p-2 font-semibold">{sku}</td>
                            <td className="p-2">
                              <input
                                aria-label={`${sku} 补货时效`}
                                type="number"
                                value={edit.leadTimeDays ?? ""}
                                onChange={(event) =>
                                  updateRuleEdit(
                                    sku,
                                    "leadTimeDays",
                                    toNullableNumber(event.target.value, true),
                                  )
                                }
                                className="h-8 w-20 rounded border border-slate-300 px-2"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                aria-label={`${sku} 安全库存`}
                                type="number"
                                value={edit.safetyDays ?? ""}
                                onChange={(event) =>
                                  updateRuleEdit(
                                    sku,
                                    "safetyDays",
                                    toNullableNumber(event.target.value, true),
                                  )
                                }
                                className="h-8 w-20 rounded border border-slate-300 px-2"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                aria-label={`${sku} 增长率`}
                                type="number"
                                value={edit.growthPercent ?? ""}
                                onChange={(event) =>
                                  updateRuleEdit(
                                    sku,
                                    "growthPercent",
                                    toNullableNumber(event.target.value),
                                  )
                                }
                                className="h-8 w-20 rounded border border-slate-300 px-2"
                              />
                            </td>
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() => saveRule(sku)}
                                disabled={mutationActive}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savingRuleSku === sku ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : null}
                                保存规则
                              </button>
                              <button
                                type="button"
                                onClick={() => saveRule(sku, true)}
                                disabled={mutationActive}
                                className="ml-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                恢复默认
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedShop && sales ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600">步骤 3</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">
                计算补货建议
              </h3>
            </div>
            <button
              type="button"
              onClick={calculatePlan}
              disabled={loading || mutationActive}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Warehouse size={15} />
              )}
              {loading ? "计算中" : "开始计算补货建议"}
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">计划日期</span>
              <input
                type="date"
                aria-label="计划日期"
                value={planningDate}
                onChange={(event) => setPlanningDate(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">补货时效（天）</span>
              <input
                type="number"
                aria-label="补货时效天数"
                min={0}
                value={leadTimeDays}
                onChange={(event) =>
                  setLeadTimeDays(Number(event.target.value) || 0)
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">安全库存（天）</span>
              <input
                type="number"
                aria-label="安全库存天数"
                min={0}
                value={safetyDays}
                onChange={(event) =>
                  setSafetyDays(Number(event.target.value) || 0)
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">目标覆盖日</span>
              <input
                type="date"
                aria-label="目标覆盖日期"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">增长率（%）</span>
              <input
                type="number"
                aria-label="增长率百分比"
                min={0}
                value={growthPercent}
                onChange={(event) =>
                  setGrowthPercent(Number(event.target.value) || 0)
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">
                统计天数
              </span>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="radio"
                    name="statistics-days-mode"
                    checked={statisticsDaysMode === "auto"}
                    onChange={() => setStatisticsDaysMode("auto")}
                  />
                  自动
                </label>
                <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="radio"
                    name="statistics-days-mode"
                    checked={statisticsDaysMode === "custom"}
                    onChange={() => setStatisticsDaysMode("custom")}
                  />
                  自定义
                </label>
                {statisticsDaysMode === "custom" ? (
                  <input
                    type="number"
                    aria-label="自定义统计天数"
                    min={1}
                    value={statisticsDaysCustom}
                    onChange={(event) =>
                      setStatisticsDaysCustom(event.target.value)
                    }
                    className="h-10 w-20 rounded-lg border border-slate-300 px-2 text-sm"
                  />
                ) : (
                  <span className="text-xs text-slate-400">
                    （{sales.shopObservedDays} 天）
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            日销 = 区间件数合计 ÷ 统计天数
            {statisticsDaysMode === "auto"
              ? `（自动取区间内实际上传天数 ${sales.shopObservedDays}）`
              : ""}
            ；到仓日 {arrivalDate || "—"}；元仓库存按 {selectedShop.site}{" "}
            站点仓库汇总。
          </p>
        </section>
      ) : null}

      {selectedShop && sales ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600">步骤 4</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">
                补货结果
              </h3>
            </div>
            {plan ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyPlan}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition hover:bg-slate-50"
                >
                  <Clipboard size={15} />
                  复制
                </button>
                <button
                  type="button"
                  onClick={exportPlan}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition hover:bg-slate-50"
                >
                  <Download size={15} />
                  导出
                </button>
              </div>
            ) : null}
          </div>
          {plan?.integration?.warnings?.length ? (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {plan.integration.warnings.join("；")}
            </div>
          ) : null}
          {plan ? (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-3 text-sm text-slate-600">
                需补货 {plan.summary.restockCount} 个 SKU，建议总量{" "}
                <b>{formatNumber(plan.summary.totalSuggestedQty)}</b>。
                {plan.metadata?.statisticsDays ? (
                  <span className="ml-2 text-xs text-slate-400">
                    统计口径：{plan.metadata.statisticsDays} 天
                    {plan.metadata.statisticsDaysOverridden
                      ? "（自定义）"
                      : "（区间实际上传天数）"}
                    {plan.metadata.pendingCount
                      ? `，${plan.metadata.pendingCount} 个 SKU 待映射未参与`
                      : ""}
                    {plan.metadata.excludedMissingInventoryCount
                      ? `，${plan.metadata.excludedMissingInventoryCount} 个映射目标缺库存档案`
                      : ""}
                  </span>
                ) : null}
              </p>
              <table
                aria-label="补货建议明细"
                className="min-w-[900px] w-full text-sm"
              >
                <thead className="border-b text-left text-slate-500">
                  <tr>
                    {sortableResultHeader("sku", "本地 SKU")}
                    <th className="p-2">状态</th>
                    {sortableResultHeader("dailySales", "日销")}
                    {sortableResultHeader("arrivalDate", "到仓日 / 覆盖天数")}
                    {sortableResultHeader("availableStock", "元仓可用")}
                    {sortableResultHeader("inTransit", "在途(前/覆盖期)")}
                    {sortableResultHeader("suggestedQty", "最终数量")}
                    <th className="p-2">提示</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlanItems.map((item) => (
                    <tr
                      key={`${item.productId}-${item.sku}`}
                      className="border-b border-slate-100"
                    >
                      <td className="p-2">
                        <div className="flex flex-col">
                          <span className="font-semibold">{item.sku}</span>
                          <span className="max-w-[14rem] truncate text-[11px] text-slate-400">
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${statusStyle[item.status]}`}
                        >
                          {statusLabel[item.status]}
                        </span>
                      </td>
                      <td className="p-2">{formatNumber(item.dailySales, 2)}</td>
                      <td className="p-2">
                        {item.arrivalDate} / {item.coverageDays}
                      </td>
                      <td className="p-2">
                        {formatNumber(item.availableStock)}
                      </td>
                      <td className="p-2">
                        {formatNumber(item.inTransitBeforeArrival)} /{" "}
                        {formatNumber(item.inTransitDuringCoverage)}
                      </td>
                      <td className="p-2 text-lg font-bold">
                        {formatNumber(item.suggestedQty)}
                      </td>
                      <td className="p-2 text-xs text-amber-700">
                        {item.warnings?.join("；")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.metadata?.excludedOversizedSkus?.length ? (
                <p className="mt-3 text-xs text-amber-700">
                  以下本地 SKU 超过 50 字符，元仓库存接口无法查询，已排除：
                  {plan.metadata.excludedOversizedSkus.join("、")}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              {step >= 3
                ? "设置参数后点击「开始计算补货建议」。"
                : "先完成 SKU 映射，再设置参数生成补货建议。"}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default RestockV3;
