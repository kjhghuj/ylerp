import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import { useStore } from "../StoreContext";
import api from "../src/api";
import {
  type ParsedRestockSalesImport,
  parseRestockSalesFile,
} from "./restock/utils/restockSalesImportParser";
import {
  rankRestockTargetSkus,
  type RankedRestockTargetSku,
  type RestockTargetSku,
} from "./restock/utils/restockTargetSku";

interface RestockSite {
  code: string;
  label: string;
  productCount: number;
  warehouseCodes: string[];
}
interface SalesImportItem {
  id: string;
  platformSku: string | null;
  sourceSku: string | null;
  validSales: number;
  title: string | null;
  spec: string | null;
  shop?: string | null;
  targetSku: string | null;
  dismissedAt?: string | null;
}
interface SalesImportData {
  import: {
    id: string;
    site: string;
    fileName: string;
    statisticsDays: number;
    createdAt: string;
  };
  items: SalesImportItem[];
  pending: SalesImportItem[];
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
  dailySales: number;
  availableStock: number;
  arrivalDate: string;
  coverageDays: number;
  inTransitBeforeArrival: number;
  inTransitDuringCoverage: number;
  safetyStockDemand: number;
  suggestedQty: number;
  warnings: string[];
}
interface RestockPlan {
  generatedAt: string;
  summary: { totalSuggestedQty: number; restockCount: number };
  items: RestockPlanItem[];
  metadata?: { excludedOversizedSkus?: string[] };
  integration?: { warnings?: string[] };
}
type EditableSkuRule = Pick<
  SkuRule,
  "leadTimeDays" | "safetyDays" | "growthPercent"
>;
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
const sameSku = (
  left: string | null | undefined,
  right: string | null | undefined,
) =>
  String(left || "")
    .trim()
    .toUpperCase() ===
  String(right || "")
    .trim()
    .toUpperCase();
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
  if (status === 400) return "提交的数据或日期参数不符合要求，请检查后再试。";
  if (status === 409) return "该 SKU 已存在，请选择已有 SKU 保存映射。";
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
const compactMatchSku = (value: string) =>
  normalizeTargetSku(value).replace(/[^A-Z0-9]/g, "");
const percentageStyle = (percentage: number) =>
  percentage === 100
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : percentage >= 80
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";

interface CandidatePickerProps {
  itemId: string;
  candidates: RankedRestockTargetSku[];
  selectedSku: string;
  selectedCandidate?: RankedRestockTargetSku;
  onChange: (sku: string) => void;
}

type CandidateMenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
  top?: number;
  bottom?: number;
};

const candidateOptionId = (itemId: string, candidateId: string) =>
  `target-sku-option-${itemId}-${candidateId}`.replace(/[^A-Za-z0-9_-]/g, "-");
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CandidatePicker: React.FC<CandidatePickerProps> = ({
  itemId,
  candidates,
  selectedSku,
  selectedCandidate,
  onChange,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const enterFrameRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<CandidateMenuPosition>({
    left: 8,
    width: 208,
    maxHeight: 256,
    placement: "bottom",
    top: 0,
  });

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 4;
    const width = Math.min(
      Math.max(rect.width, 208),
      Math.max(208, viewportWidth - 16),
    );
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const belowSpace = viewportHeight - rect.bottom - gap - 8;
    const aboveSpace = rect.top - gap - 8;
    const placement =
      belowSpace < 180 && aboveSpace > belowSpace ? "top" : "bottom";
    const availableSpace = placement === "top" ? aboveSpace : belowSpace;
    const maxHeight = Math.max(96, Math.min(256, availableSpace));
    setMenuPosition(
      placement === "top"
        ? {
            left,
            width,
            maxHeight,
            placement,
            bottom: viewportHeight - rect.top + gap,
          }
        : { left, width, maxHeight, placement, top: rect.bottom + gap },
    );
  }, []);

  const closeMenu = useCallback(() => {
    if (enterFrameRef.current !== null)
      window.cancelAnimationFrame(enterFrameRef.current);
    if (exitTimerRef.current !== null)
      window.clearTimeout(exitTimerRef.current);
    setExpanded(false);
    setMenuVisible(false);
    if (prefersReducedMotion()) {
      setMenuMounted(false);
      return;
    }
    exitTimerRef.current = window.setTimeout(() => {
      setMenuMounted(false);
      exitTimerRef.current = null;
    }, 160);
  }, []);

  const openMenu = useCallback(() => {
    if (exitTimerRef.current !== null)
      window.clearTimeout(exitTimerRef.current);
    if (enterFrameRef.current !== null)
      window.cancelAnimationFrame(enterFrameRef.current);
    updateMenuPosition();
    setExpanded(true);
    setMenuMounted(true);
    setMenuVisible(false);
    enterFrameRef.current = window.requestAnimationFrame(() => {
      setMenuVisible(true);
      enterFrameRef.current = null;
    });
  }, [updateMenuPosition]);

  useEffect(() => {
    const close = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        closeMenu();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [closeMenu]);

  useEffect(() => {
    if (!menuMounted) return undefined;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuMounted, updateMenuPosition]);

  useEffect(
    () => () => {
      if (enterFrameRef.current !== null)
        window.cancelAnimationFrame(enterFrameRef.current);
      if (exitTimerRef.current !== null)
        window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const index = candidates.findIndex((candidate) =>
      sameSku(candidate.sku, selectedSku),
    );
    setActiveIndex(index >= 0 ? index : 0);
  }, [candidates, selectedSku]);

  useEffect(() => {
    if (!expanded || !menuMounted) return;
    const active = candidates[activeIndex];
    if (!active) return;
    const option = document.getElementById(
      candidateOptionId(itemId, active.id),
    );
    if (option && typeof option.scrollIntoView === "function")
      option.scrollIntoView({ block: "nearest" });
  }, [activeIndex, candidates, expanded, itemId, menuMounted]);

  const select = (candidate?: RankedRestockTargetSku) => {
    if (candidate) onChange(candidate.sku);
    closeMenu();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) {
        openMenu();
        return;
      }
      if (!candidates.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (previous) =>
          (previous + direction + candidates.length) % candidates.length,
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) select(candidates[activeIndex]);
      else openMenu();
    }
  };

  const activeCandidate = expanded ? candidates[activeIndex] : undefined;
  const activeDescendant = activeCandidate
    ? candidateOptionId(itemId, activeCandidate.id)
    : undefined;
  const menu = menuMounted
    ? createPortal(
        <div
          ref={menuRef}
          id={`target-sku-options-${itemId}`}
          role="listbox"
          aria-label="本地 SKU 候选"
          data-state={menuVisible ? "open" : expanded ? "entering" : "exiting"}
          data-placement={menuPosition.placement}
          style={{
            position: "fixed",
            zIndex: 100,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            top: menuPosition.top,
            bottom: menuPosition.bottom,
          }}
          className={`overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl transition-[opacity,transform] duration-[160ms] motion-reduce:transition-none motion-reduce:transform-none ${
            menuVisible
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : `pointer-events-none scale-[.98] opacity-0 ${menuPosition.placement === "top" ? "translate-y-1" : "-translate-y-1"}`
          }`}
        >
          {candidates.length ? (
            candidates.map((candidate, index) => (
              <button
                id={candidateOptionId(itemId, candidate.id)}
                key={candidate.id}
                type="button"
                role="option"
                aria-selected={sameSku(candidate.sku, selectedSku)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(candidate)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <span className="font-medium">{candidate.sku}</span>
                {candidate.matchPercentage !== undefined ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ring-1 ${percentageStyle(candidate.matchPercentage)}`}
                  >
                    {candidate.matchPercentage}%
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">没有符合的 SKU</p>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="relative min-w-[13rem]">
      <button
        ref={triggerRef}
        type="button"
        data-testid={`target-sku-select-${itemId}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={`target-sku-options-${itemId}`}
        aria-activedescendant={activeDescendant}
        onClick={() => (expanded ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm transition duration-[160ms] hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {selectedCandidate?.sku || "选择本地 SKU"}
          </span>
          {selectedCandidate?.matchPercentage !== undefined ? (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ring-1 ${percentageStyle(selectedCandidate.matchPercentage)}`}
            >
              {selectedCandidate.matchPercentage}%
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-500 transition-transform duration-[160ms] motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </div>
  );
};

export const RestockV2: React.FC = () => {
  const { inventory, products } = useStore();
  const [sites, setSites] = useState<RestockSite[]>([]);
  const [ycConfigured, setYcConfigured] = useState(false);
  const [selectedSite, setSelectedSite] = useState("");
  const [pendingSiteChange, setPendingSiteChange] =
    useState<RestockSite | null>(null);
  const [statisticsDays, setStatisticsDays] = useState(30);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRestockSalesImport | null>(null);
  const [salesImport, setSalesImport] = useState<SalesImportData | null>(null);
  const [rules, setRules] = useState<SkuRule[]>([]);
  const [ruleEdits, setRuleEdits] = useState<Record<string, EditableSkuRule>>(
    {},
  );
  const [mappingSelection, setMappingSelection] = useState<
    Record<string, string>
  >({});
  const [mappingSearch, setMappingSearch] = useState<Record<string, string>>(
    {},
  );
  const [mappingDirty, setMappingDirty] = useState<Record<string, true>>({});
  const [mappingTab, setMappingTab] = useState<MappingTab>("pending");
  const [mappingSectionCollapsed, setMappingSectionCollapsed] = useState(false);
  const [rulesSectionCollapsed, setRulesSectionCollapsed] = useState(false);
  const [queueFilter, setQueueFilter] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [createdTargetSkus, setCreatedTargetSkus] = useState<
    RestockTargetSku[]
  >([]);
  const [remoteTargetSkus, setRemoteTargetSkus] = useState<
    RestockTargetSku[]
  >([]);
  const [creatingTargetFor, setCreatingTargetFor] = useState<
    Record<string, boolean>
  >({});
  const [targetSkuDrafts, setTargetSkuDrafts] = useState<
    Record<string, TargetSkuDraft>
  >({});
  const [savingItemId, setSavingItemId] = useState("");
  const [dismissingItemId, setDismissingItemId] = useState("");
  const [dismissedExitItemId, setDismissedExitItemId] = useState("");
  const [creatingItemId, setCreatingItemId] = useState("");
  const [quickCreatingItemId, setQuickCreatingItemId] = useState("");
  const [savingRuleSku, setSavingRuleSku] = useState("");
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
  const [excludedOversizedSkus, setExcludedOversizedSkus] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mutationActive, setMutationActive] = useState(false);
  const [autoMatchingCount, setAutoMatchingCount] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const siteRequestGenerationRef = useRef(0);
  const salesImportLoadTokenRef = useRef(0);
  const targetSkuLoadTokenRef = useRef(0);
  const fileParseGenerationRef = useRef(0);
  const mutationLockRef = useRef(false);
  const autoMatchAttemptedRef = useRef<Set<string>>(new Set());
  const dismissalTimersRef = useRef<Map<string, number>>(new Map());
  const selectedSiteRef = useRef(selectedSite);
  const initiatingSiteButtonRef = useRef<HTMLButtonElement | null>(null);
  const siteDialogRef = useRef<HTMLDivElement | null>(null);
  const stayOnSiteButtonRef = useRef<HTMLButtonElement | null>(null);

  selectedSiteRef.current = selectedSite;

  const selectedSiteInfo = sites.find((site) => site.code === selectedSite);
  const targetSkus = useMemo(() => {
    const unique = new Map<string, RestockTargetSku>();
    [...remoteTargetSkus, ...inventory, ...products].forEach((item) => {
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
  }, [createdTargetSkus, inventory, products, remoteTargetSkus]);
  const exactTargetLookup = useMemo(() => {
    const normalized = new Map<string, RestockTargetSku>();
    const compact = new Map<string, RestockTargetSku | null>();
    targetSkus.forEach((candidate) => {
      normalized.set(normalizeTargetSku(candidate.sku), candidate);
      const compactSku = compactMatchSku(candidate.sku);
      if (!compactSku) return;
      compact.set(compactSku, compact.has(compactSku) ? null : candidate);
    });
    return { normalized, compact };
  }, [targetSkus]);
  const pendingItems = useMemo(
    () =>
      (salesImport?.pending || salesImport?.items || []).filter(
        (item) => !item.targetSku && !item.dismissedAt,
      ),
    [salesImport],
  );
  const mappedItems = useMemo(
    () =>
      (salesImport?.items || []).filter(
        (item) => item.targetSku && !item.dismissedAt,
      ),
    [salesImport],
  );
  const filteredQueue = useMemo(() => {
    const source = mappingTab === "pending" ? pendingItems : mappedItems;
    const query = queueFilter.trim().toUpperCase();
    return !query
      ? source
      : source.filter((item) =>
          [item.platformSku, item.sourceSku, item.targetSku].some((value) =>
            String(value || "")
              .toUpperCase()
              .includes(query),
          ),
        );
  }, [mappedItems, mappingTab, pendingItems, queueFilter]);
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
    visibleQueue.forEach((item) => {
      const platformSku = item.platformSku || "";
      ranked.set(
        item.id,
        platformSku.trim()
          ? rankRestockTargetSkus(platformSku, targetSkus)
          : targetSkus.map((candidate) => ({ ...candidate })),
      );
    });
    return ranked;
  }, [mappingTab, targetSkus, visibleQueue]);
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
  const hasUnsavedWork =
    Object.keys(mappingDirty).length > 0 ||
    Object.values(creatingTargetFor).some(Boolean) ||
    Object.values(targetSkuDrafts).some((draft) =>
      Boolean(draft.sku.trim() || draft.name.trim()),
    );
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
  const clearDismissalTimers = useCallback(() => {
    dismissalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    dismissalTimersRef.current.clear();
  }, []);

  const clearTransientState = useCallback(() => {
    fileParseGenerationRef.current += 1;
    clearDismissalTimers();
    setSelectedFile(null);
    setPreview(null);
    setMappingSelection({});
    setMappingSearch({});
    setMappingDirty({});
    setCreatingTargetFor({});
    setTargetSkuDrafts({});
    setDismissedExitItemId("");
    setQueueFilter("");
    setMappingTab("pending");
    setQueuePage(1);
    setPlan(null);
    setResultSort({ key: null, direction: "ascending" });
    setExcludedOversizedSkus([]);
  }, [clearDismissalTimers]);

  const loadSalesImport = useCallback(
    async (
      site: string,
      importId?: string,
      generation = siteRequestGenerationRef.current,
    ) => {
      const loadToken = ++salesImportLoadTokenRef.current;
      try {
        const response = importId
          ? await api.get(`/restock-v2/sales-imports/${importId}`)
          : await api.get("/restock-v2/sales-imports/latest", {
              params: { site },
            });
        if (
          loadToken !== salesImportLoadTokenRef.current ||
          generation !== siteRequestGenerationRef.current ||
          selectedSiteRef.current !== site
        )
          return;
        setSalesImport(response.data as SalesImportData);
      } catch (requestError) {
        if (
          loadToken !== salesImportLoadTokenRef.current ||
          generation !== siteRequestGenerationRef.current ||
          selectedSiteRef.current !== site
        )
          return;
        const status =
          requestError &&
          typeof requestError === "object" &&
          "response" in requestError
            ? (requestError as { response?: { status?: number } }).response
                ?.status
            : undefined;
        setSalesImport(null);
        if (status !== 404)
          setError(friendlyError(requestError, "读取当前站点的销售批次失败。"));
      }
    },
    [],
  );
  const loadTargetSkus = useCallback(
    async (generation = siteRequestGenerationRef.current) => {
      const loadToken = ++targetSkuLoadTokenRef.current;
      try {
        const response = await api.get("/restock-v2/target-skus");
        if (
          loadToken !== targetSkuLoadTokenRef.current ||
          generation !== siteRequestGenerationRef.current
        )
          return;
        const data = response.data as { items?: RestockTargetSku[] };
        setRemoteTargetSkus(data.items || []);
      } catch {
        // Keep the existing in-memory candidates when the refresh is unavailable.
      }
    },
    [],
  );

  useEffect(
    () => () => clearDismissalTimers(),
    [clearDismissalTimers, salesImport?.import.id, selectedSite],
  );

  useEffect(() => {
    const loadSites = async () => {
      try {
        const response = await api.get("/restock-v2/sites");
        const data = response.data as {
          ycConfigured?: boolean;
          sites?: RestockSite[];
        };
        const nextSites = data.sites || [];
        setSites(nextSites);
        setYcConfigured(Boolean(data.ycConfigured));
        if (nextSites.length)
          setSelectedSite((current) => current || nextSites[0].code);
      } catch (requestError) {
        setError(friendlyError(requestError, "读取补货站点失败。"));
      }
    };
    void loadSites();
  }, []);

  useEffect(() => {
    if (!selectedSite) return;
    const generation = ++siteRequestGenerationRef.current;
    clearTransientState();
    void loadSalesImport(selectedSite, undefined, generation);
    void loadTargetSkus(generation);
    api
      .get("/restock-v2/sku-rules", { params: { site: selectedSite } })
      .then((response) => {
        if (
          generation === siteRequestGenerationRef.current &&
          selectedSiteRef.current === selectedSite
        ) {
          setRules((response.data as { rules?: SkuRule[] }).rules || []);
        }
      })
      .catch(() => {
        if (
          generation === siteRequestGenerationRef.current &&
          selectedSiteRef.current === selectedSite
        )
          setRules([]);
      });
  }, [clearTransientState, loadSalesImport, loadTargetSkus, selectedSite]);

  useEffect(() => {
    if (mappingTab !== "pending" || !visibleQueue.length) return;
    setMappingSelection((previous) => {
      const next = { ...previous };
      let changed = false;
      visibleQueue.forEach((item) => {
        const platformSku = item.platformSku || "";
        if (!platformSku.trim() || next[item.id]) return;
        const top = rankedVisibleCandidates.get(item.id)?.[0];
        if (top) {
          next[item.id] = top.sku;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [mappingTab, rankedVisibleCandidates, visibleQueue]);

  useEffect(() => {
    if (!salesImport || !selectedSite || mutationActive || !pendingItems.length)
      return;

    const matches = pendingItems.flatMap((item) => {
      const platformSku = String(item.platformSku || "").trim();
      if (!platformSku) return [];
      const normalizedMatch = exactTargetLookup.normalized.get(
        normalizeTargetSku(platformSku),
      );
      const compactMatch = exactTargetLookup.compact.get(
        compactMatchSku(platformSku),
      );
      const target = normalizedMatch || compactMatch;
      const attemptKey = `${salesImport.import.id}:${item.id}`;
      return target && !autoMatchAttemptedRef.current.has(attemptKey)
        ? [{ item, target, attemptKey }]
        : [];
    });
    if (!matches.length || !beginMutation()) return;

    matches.forEach(({ attemptKey }) =>
      autoMatchAttemptedRef.current.add(attemptKey),
    );
    const requestSite = selectedSite;
    const requestImportId = salesImport.import.id;
    const requestGeneration = siteRequestGenerationRef.current;
    setAutoMatchingCount(matches.length);
    setError("");

    void Promise.allSettled(
      matches.map(({ item, target }) =>
        api.put(
          `/restock-v2/sales-imports/${requestImportId}/items/${item.id}/mapping`,
          { targetSku: target.sku },
        ),
      ),
    )
      .then((results) => {
        if (
          requestGeneration !== siteRequestGenerationRef.current ||
          selectedSiteRef.current !== requestSite
        )
          return;
        const succeeded = new Map<string, string>();
        results.forEach((result, index) => {
          if (result.status === "fulfilled")
            succeeded.set(matches[index].item.id, matches[index].target.sku);
        });
        if (succeeded.size) {
          setSalesImport((previous) =>
            previous?.import.id === requestImportId
              ? {
                  ...previous,
                  items: previous.items.map((item) =>
                    succeeded.has(item.id)
                      ? { ...item, targetSku: succeeded.get(item.id) || null }
                      : item,
                  ),
                  pending: previous.pending.filter(
                    (item) => !succeeded.has(item.id),
                  ),
                }
              : previous,
          );
          setNotice(`已自动匹配 ${succeeded.size} 条 100% SKU。`);
        }
        const failedCount = results.length - succeeded.size;
        if (failedCount)
          setError(`${failedCount} 条 100% SKU 自动匹配失败，请人工保存。`);
      })
      .finally(() => {
        setAutoMatchingCount(0);
        endMutation();
      });
  }, [
    beginMutation,
    endMutation,
    exactTargetLookup,
    mutationActive,
    pendingItems,
    salesImport,
    selectedSite,
  ]);

  useEffect(() => {
    setQueuePage(1);
  }, [mappingTab, queueFilter, salesImport?.import.id, selectedSite]);
  useEffect(() => {
    setQueuePage((page) => Math.min(page, queuePageCount));
  }, [queuePageCount]);

  useEffect(() => {
    if (!pendingSiteChange) return undefined;
    stayOnSiteButtonRef.current?.focus();
    const initiatingButton = initiatingSiteButtonRef.current;
    return () => {
      initiatingButton?.focus();
    };
  }, [pendingSiteChange]);

  const requestSiteChange = (
    site: RestockSite,
    initiatingButton: HTMLButtonElement,
  ) => {
    if (site.code === selectedSite || mutationActive) return;
    initiatingSiteButtonRef.current = initiatingButton;
    if (hasUnsavedWork) {
      setPendingSiteChange(site);
      return;
    }
    setSelectedSite(site.code);
  };
  const closeSiteChangeDialog = () => setPendingSiteChange(null);
  const confirmSiteChange = () => {
    if (pendingSiteChange) setSelectedSite(pendingSiteChange.code);
    setPendingSiteChange(null);
  };
  const handleSiteDialogKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSiteChangeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      siteDialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) || [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] || null;
    const parseGeneration = ++fileParseGenerationRef.current;
    setSelectedFile(file);
    setPreview(null);
    setError("");
    if (!file) return;
    try {
      const parsed = await parseRestockSalesFile(file);
      if (parseGeneration === fileParseGenerationRef.current)
        setPreview(parsed);
    } catch (requestError) {
      if (parseGeneration === fileParseGenerationRef.current) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "无法解析销售 Excel 文件。",
        );
      }
    }
  };
  const uploadSalesImport = async () => {
    if (
      !preview ||
      !selectedFile ||
      !selectedSite ||
      !Number.isInteger(statisticsDays) ||
      statisticsDays < 1
    ) {
      setError("请选择销售文件，并填写大于 0 的统计天数。");
      return;
    }
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestGeneration = siteRequestGenerationRef.current;
    setUploading(true);
    setError("");
    try {
      const response = await api.post("/restock-v2/sales-imports", {
        site: requestSite,
        fileName: selectedFile.name,
        statisticsDays,
        rows: preview.rows,
      });
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      salesImportLoadTokenRef.current += 1;
      clearTransientState();
      setSalesImport(response.data as SalesImportData);
      setNotice("销售批次已导入，待映射记录暂不参与补货计算。");
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
        setError(friendlyError(requestError, "导入销售数据失败。"));
      }
    } finally {
      setUploading(false);
      endMutation();
    }
  };
  const saveMapping = async (item: SalesImportItem) => {
    const targetSku = mappingSelection[item.id];
    if (!salesImport || !targetSku) {
      setError("请先选择本地 SKU。");
      return;
    }
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestImportId = salesImport.import.id;
    const requestGeneration = siteRequestGenerationRef.current;
    setSavingItemId(item.id);
    setError("");
    try {
      await api.put(
        `/restock-v2/sales-imports/${requestImportId}/items/${item.id}/mapping`,
        { targetSku },
      );
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      setMappingDirty((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      setNotice(
        `${item.platformSku || item.sourceSku || "当前记录"} 的映射已保存。`,
      );
      await loadSalesImport(requestSite, requestImportId, requestGeneration);
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
        setError(friendlyError(requestError, "保存映射失败。"));
      }
    } finally {
      setSavingItemId("");
      endMutation();
    }
  };
  const dismissMapping = async (item: SalesImportItem) => {
    if (!salesImport) return;
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestImportId = salesImport.import.id;
    const requestGeneration = siteRequestGenerationRef.current;
    setDismissingItemId(item.id);
    setError("");
    try {
      const response = await api.patch(
        `/restock-v2/sales-imports/${requestImportId}/items/${item.id}/dismissal`,
        { dismissed: true },
      );
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      setDismissingItemId("");
      setDismissedExitItemId(item.id);
      setNotice(
        "已取消当前映射；该记录会在本批次中保持隐藏，下次导入会再次出现。",
      );
      const finishDismissal = () => {
        if (
          requestGeneration !== siteRequestGenerationRef.current ||
          selectedSiteRef.current !== requestSite
        )
          return;
        const dismissedAt = String(
          (response.data as { dismissedAt?: string } | undefined)
            ?.dismissedAt || new Date().toISOString(),
        );
        setSalesImport((previous) =>
          previous
            ? {
                ...previous,
                items: previous.items.map((current) =>
                  current.id === item.id
                    ? { ...current, dismissedAt }
                    : current,
                ),
                pending: previous.pending.filter(
                  (current) => current.id !== item.id,
                ),
              }
            : previous,
        );
        setMappingSelection((previous) => {
          const next = { ...previous };
          delete next[item.id];
          return next;
        });
        setMappingDirty((previous) => {
          const next = { ...previous };
          delete next[item.id];
          return next;
        });
        setDismissedExitItemId((current) =>
          current === item.id ? "" : current,
        );
      };
      if (prefersReducedMotion()) finishDismissal();
      else {
        const timer = window.setTimeout(() => {
          dismissalTimersRef.current.delete(item.id);
          finishDismissal();
        }, 180);
        dismissalTimersRef.current.set(item.id, timer);
      }
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
        setError(friendlyError(requestError, "取消映射失败。"));
      }
    } finally {
      setDismissingItemId("");
      endMutation();
    }
  };
  const getTargetSkuDraft = (itemId: string): TargetSkuDraft =>
    targetSkuDrafts[itemId] || { sku: "", name: "" };
  const cancelTargetSkuCreation = (itemId: string) => {
    setCreatingTargetFor((previous) => ({ ...previous, [itemId]: false }));
    setTargetSkuDrafts((previous) => {
      const next = { ...previous };
      delete next[itemId];
      return next;
    });
  };
  const createTargetSku = async (item: SalesImportItem) => {
    const draft = getTargetSkuDraft(item.id);
    const sku = normalizeTargetSku(draft.sku);
    if (!sku || !selectedSite) {
      setError("请填写新建本地 SKU。");
      return;
    }
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestGeneration = siteRequestGenerationRef.current;
    setCreatingItemId(item.id);
    try {
      const response = await api.post("/restock-v2/target-skus", {
        site: requestSite,
        sku,
        name: draft.name.trim() || sku,
      });
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      const created = response.data as RestockTargetSku;
      setCreatedTargetSkus((previous) => [
        ...previous.filter((current) => !sameSku(current.sku, created.sku)),
        created,
      ]);
      setMappingSelection((previous) => ({
        ...previous,
        [item.id]: created.sku,
      }));
      setMappingDirty((previous) => ({ ...previous, [item.id]: true }));
      cancelTargetSkuCreation(item.id);
      setNotice("本地 SKU 已创建并选中；请继续保存映射。");
      void loadTargetSkus(requestGeneration);
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
        setError(friendlyError(requestError, "创建本地 SKU 失败。"));
      }
    } finally {
      setCreatingItemId("");
      endMutation();
    }
  };
  const quickCreateTargetSkuAndSaveMapping = async (item: SalesImportItem) => {
    const sku = normalizeTargetSku(item.platformSku || "");
    if (!salesImport || !selectedSite || !sku) {
      setError("当前记录缺少平台 SKU，无法快速新建并保存映射。");
      return;
    }
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestImportId = salesImport.import.id;
    const requestGeneration = siteRequestGenerationRef.current;
    let availableSku =
      targetSkus.find((candidate) => sameSku(candidate.sku, sku)) || null;
    let alreadyExisted = Boolean(availableSku);
    setQuickCreatingItemId(item.id);
    setError("");
    try {
      if (!availableSku) {
        try {
          const response = await api.post("/restock-v2/target-skus", {
            site: requestSite,
            sku,
            name: sku,
          });
          availableSku = response.data as RestockTargetSku;
        } catch (requestError) {
          if (requestStatus(requestError) !== 409) throw requestError;
          alreadyExisted = true;
          availableSku = { id: `existing-${sku}`, sku, name: sku };
        }
      }
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      const targetSku = availableSku;
      if (!targetSku) return;
      autoMatchAttemptedRef.current.add(`${requestImportId}:${item.id}`);
      setCreatedTargetSkus((previous) => [
        ...previous.filter(
          (current) => !sameSku(current.sku, targetSku.sku),
        ),
        targetSku,
      ]);
      setMappingSelection((previous) => ({
        ...previous,
        [item.id]: targetSku.sku,
      }));

      await api.put(
        `/restock-v2/sales-imports/${requestImportId}/items/${item.id}/mapping`,
        { targetSku: targetSku.sku },
      );
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      setMappingDirty((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      cancelTargetSkuCreation(item.id);
      setNotice(
        alreadyExisted
          ? `本地 SKU ${sku} 已存在，已保存映射。`
          : `平台 SKU ${sku} 已新建并保存映射。`,
      );
      await Promise.all([
        loadSalesImport(requestSite, requestImportId, requestGeneration),
        loadTargetSkus(requestGeneration),
      ]);
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
        if (availableSku) {
          setMappingDirty((previous) => ({ ...previous, [item.id]: true }));
          setError(
            alreadyExisted
              ? `本地 SKU ${availableSku.sku} 已存在，但保存映射失败，请直接点击“保存映射”重试。`
              : `本地 SKU ${availableSku.sku} 已创建，但保存映射失败，请直接点击“保存映射”重试。`,
          );
        } else {
          setError(friendlyError(requestError, "快速新建本地 SKU 失败。"));
        }
      }
    } finally {
      setQuickCreatingItemId("");
      endMutation();
    }
  };
  const getRuleEdit = (sku: string): EditableSkuRule =>
    ruleEdits[sku] || {
      leadTimeDays:
        rules.find((rule) => sameSku(rule.sku, sku))?.leadTimeDays ?? null,
      safetyDays:
        rules.find((rule) => sameSku(rule.sku, sku))?.safetyDays ?? null,
      growthPercent:
        rules.find((rule) => sameSku(rule.sku, sku))?.growthPercent ?? null,
    };
  const updateRuleEdit = (
    sku: string,
    field: keyof EditableSkuRule,
    value: number | null,
  ) =>
    setRuleEdits((previous) => ({
      ...previous,
      [sku]: { ...getRuleEdit(sku), [field]: value },
    }));
  const saveRule = async (sku: string, clear = false) => {
    if (!selectedSite) return;
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestGeneration = siteRequestGenerationRef.current;
    const data = clear
      ? { leadTimeDays: null, safetyDays: null, growthPercent: null }
      : getRuleEdit(sku);
    setSavingRuleSku(sku);
    try {
      const response = await api.put(
        `/restock-v2/sku-rules/${encodeURIComponent(sku)}`,
        { site: requestSite, ...data },
      );
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      const updated = response.data as SkuRule;
      setRules((previous) => [
        ...previous.filter((rule) => !sameSku(rule.sku, sku)),
        updated,
      ]);
      setRuleEdits((previous) => ({ ...previous, [sku]: data }));
      setNotice(clear ? "已恢复全局默认规则。" : "SKU 覆盖规则已保存。");
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
        setError(friendlyError(requestError, "SKU 覆盖规则保存失败。"));
      }
    } finally {
      setSavingRuleSku("");
      endMutation();
    }
  };
  const requestRecommendations = async () => {
    if (!selectedSite || !salesImport) {
      setError("请先上传并确认销售 Excel。");
      return;
    }
    if (
      !isValidIsoDate(planningDate) ||
      !isValidIsoDate(targetDate) ||
      !Number.isInteger(leadTimeDays) ||
      !Number.isInteger(safetyDays) ||
      !Number.isFinite(growthPercent) ||
      leadTimeDays < 0 ||
      safetyDays < 0 ||
      growthPercent < 0 ||
      growthPercent > MAX_GROWTH_PERCENT ||
      targetDate <= arrivalDate
    ) {
      setError(
        "请检查日期、补货时效、安全库存和增长率；目标覆盖日必须晚于到仓日。",
      );
      return;
    }
    if (!beginMutation()) return;
    const requestSite = selectedSite;
    const requestImportId = salesImport.import.id;
    const requestGeneration = siteRequestGenerationRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/restock-v2/recommendations", {
        site: requestSite,
        salesImportId: requestImportId,
        planningDate,
        targetDate,
        leadTimeDays,
        safetyDays,
        growthPercent,
      });
      if (
        requestGeneration !== siteRequestGenerationRef.current ||
        selectedSiteRef.current !== requestSite
      )
        return;
      const nextPlan = response.data as RestockPlan;
      setPlan(nextPlan);
      setResultSort({ key: null, direction: "ascending" });
      setExcludedOversizedSkus(
        nextPlan.metadata?.excludedOversizedSkus?.filter(Boolean) || [],
      );
    } catch (requestError) {
      if (
        requestGeneration === siteRequestGenerationRef.current &&
        selectedSiteRef.current === requestSite
      ) {
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
    if (!sortedPlanItems.length) return;
    const lines = [
      formatCsvRow([
        "本地 SKU",
        "日销",
        "到仓日 / 覆盖天数",
        "元仓可用",
        "在途",
        "最终数量",
        "提示",
      ]),
      ...sortedPlanItems.map((item) =>
        formatCsvRow([
          item.sku,
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
    link.download = `补货建议_${selectedSite}_${planningDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const step = !salesImport ? 1 : pendingItems.length ? 2 : plan ? 4 : 3;
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
          className="inline-flex items-center gap-1 rounded-md py-1 font-semibold transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {label}
          <SortIcon size={14} aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <div className="h-full min-h-0 pb-8 text-slate-800">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600">
              RESTOCK WORKBENCH
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              补货 V2 · 专注映射工作台
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              先明确站点，再导入销量、审核 SKU 映射并生成补货建议。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            <CircleHelp size={14} />
            标题与规格仅用于人工审核
          </span>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2 sm:grid-cols-3">
            {sites.map((site) => (
              <button
                key={site.code}
                type="button"
                disabled={mutationActive}
                aria-busy={mutationActive}
                onClick={(event) =>
                  requestSiteChange(site, event.currentTarget)
                }
                className={`group flex min-h-20 items-center justify-between rounded-xl border p-3 text-left transition duration-[160ms] focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${site.code === selectedSite ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"}`}
              >
                <span>
                  <span className="block text-sm font-bold">
                    {site.label || site.code}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {site.code} · {site.productCount} 个本地商品
                  </span>
                </span>
                <Warehouse
                  size={20}
                  className={
                    site.code === selectedSite
                      ? "text-blue-600"
                      : "text-slate-400"
                  }
                />
              </button>
            ))}
          </div>
          <div className="flex min-w-[13rem] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Warehouse size={18} className="text-blue-600" />
            <div>
              <p className="text-xs text-slate-500">元仓绑定</p>
              <p className="text-sm font-semibold text-slate-800">
                {selectedSiteInfo?.warehouseCodes?.length
                  ? `YC 仓 · ${selectedSiteInfo.warehouseCodes.join("、")}`
                  : "暂未绑定仓库"}
              </p>
            </div>
            <span
              className={`ml-auto rounded-full px-2 py-1 text-xs font-semibold ${ycConfigured && selectedSiteInfo?.warehouseCodes?.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
            >
              {ycConfigured && selectedSiteInfo?.warehouseCodes?.length
                ? "已绑定"
                : "待配置"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            当前批次：{salesImport?.import.fileName || "尚未导入"}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            待映射：{pendingItems.length}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            建议：{plan ? `${plan.summary.restockCount} 个 SKU` : "尚未计算"}
          </span>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertTriangle size={17} />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 size={17} />
          {notice}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 xl:h-fit xl:sticky xl:top-4">
          <ol className="grid grid-cols-4 gap-1 xl:grid-cols-1">
            {[
              ["导入销售数据", "选择文件并确认统计天数"],
              ["审核 SKU 映射", "仅按 SKU 推荐候选"],
              ["计算补货建议", "设置补货范围和安全库存"],
              ["生成结果", "导出或复制建议"],
            ].map(([title, detail], index) => {
              const number = index + 1;
              return (
                <li
                  key={title}
                  className={`rounded-xl p-3 ${number === step ? "bg-blue-50 text-blue-900" : number < step ? "text-emerald-700" : "text-slate-500"}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${number === step ? "bg-blue-600 text-white" : number < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {number}
                    </span>
                    <span className="hidden text-sm font-semibold sm:inline xl:inline">
                      {title}
                    </span>
                  </div>
                  <p className="mt-1 hidden pl-8 text-xs xl:block">{detail}</p>
                </li>
              );
            })}
          </ol>
        </aside>
        <fieldset
          disabled={mutationActive}
          className="min-w-0 space-y-4 disabled:cursor-wait"
        >
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold text-blue-600">步骤 1</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  导入近期开单有效销量
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  要求填写统计天数；按平台 SKU 聚合，不通过标题或规格自动匹配。
                </p>
              </div>
              {salesImport ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-right text-xs text-slate-600">
                  <p>{salesImport.import.fileName}</p>
                  <p className="mt-1">
                    导入于{" "}
                    {new Date(salesImport.import.createdAt).toLocaleString(
                      "zh-CN",
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium text-slate-700">
                统计天数
                <input
                  aria-label="统计天数"
                  type="number"
                  min={1}
                  max={MAX_PLANNING_DAYS}
                  value={statisticsDays}
                  onChange={(event) =>
                    setStatisticsDays(Number(event.target.value) || 0)
                  }
                  className="ml-2 h-10 w-20 rounded-lg border border-slate-300 px-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="min-w-[15rem] text-sm font-medium text-slate-700">
                销售 Excel 文件
                <input
                  aria-label="销售 Excel 文件"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
              </label>
              <button
                type="button"
                onClick={uploadSalesImport}
                disabled={
                  !preview || !selectedFile || mutationActive || !selectedSite
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition duration-[160ms] hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {uploading ? "上传中" : "确认上传"}
              </button>
            </div>
            {preview ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <FileSpreadsheet size={16} />
                <span>已解析 {preview.sourceRowCount} 行</span>
                <span>聚合为 {preview.rows.length} 条</span>
                <span>待人工映射 {preview.pendingCount} 条</span>
              </div>
            ) : null}
            {salesImport ? (
              <p className="mt-4 text-sm text-slate-600">
                当前批次共 {salesImport.items.length} 条聚合销量，已映射{" "}
                {mappedItems.length} 条；待映射或取消映射的记录不参与补货计算。
              </p>
            ) : null}
          </section>

          {salesImport ? (
            <section className="overflow-visible rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
              <div className="border-b border-amber-200 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-700">步骤 2</p>
                    <h3 className="mt-1 text-lg font-bold text-amber-950">
                      SKU 映射审核
                    </h3>
                    <p className="mt-1 text-sm text-amber-800">
                      候选只按 SKU 显示匹配百分比；唯一 100% 候选会自动保存，
                      其余仍需人工审核。
                      {autoMatchingCount ? ` 正在自动匹配 ${autoMatchingCount} 条…` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!mappingSectionCollapsed ? (
                      <div className="relative">
                        <Search
                          size={16}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          value={queueFilter}
                          onChange={(event) => setQueueFilter(event.target.value)}
                          placeholder="搜索平台 / 本地 SKU"
                          aria-label="搜索映射 SKU"
                          className="h-10 w-full rounded-lg border border-amber-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:w-60"
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={!mappingSectionCollapsed}
                      aria-label={`${mappingSectionCollapsed ? "展开" : "折叠"} SKU 映射审核`}
                      onClick={() =>
                        setMappingSectionCollapsed((collapsed) => !collapsed)
                      }
                      className="inline-flex h-10 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                    >
                      {mappingSectionCollapsed ? "展开" : "折叠"}
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-[160ms] ${mappingSectionCollapsed ? "" : "rotate-180"}`}
                      />
                    </button>
                  </div>
                </div>
                {!mappingSectionCollapsed ? (
                  <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMappingTab("pending")}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mappingTab === "pending" ? "bg-amber-700 text-white shadow-sm" : "bg-white text-amber-900 hover:bg-amber-100"}`}
                  >
                    待审核 {pendingItems.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMappingTab("mapped")}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mappingTab === "mapped" ? "bg-amber-700 text-white shadow-sm" : "bg-white text-amber-900 hover:bg-amber-100"}`}
                  >
                    已映射 {mappedItems.length}
                  </button>
                  </div>
                ) : null}
              </div>
              {!mappingSectionCollapsed ? <>
              <div className="overflow-x-auto">
                <table className="min-w-[1060px] w-full text-sm">
                  <thead className="bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-900">
                    <tr>
                      <th className="px-4 py-3 font-semibold">平台 SKU</th>
                      <th className="px-4 py-3 font-semibold">标题 / 规格</th>
                      <th className="px-4 py-3 font-semibold">有效销量</th>
                      <th className="px-4 py-3 font-semibold">本地 SKU</th>
                      <th className="sticky right-0 z-10 bg-amber-50 px-4 py-3 font-semibold shadow-[-8px_0_12px_-12px_rgba(15,23,42,.5)]">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {visibleQueue.map((item) => {
                      const sourceSku =
                        item.platformSku || item.sourceSku || "";
                      const rankedCandidates =
                        rankedVisibleCandidates.get(item.id) || [];
                      const candidateQuery = normalizeTargetSku(
                        mappingSearch[item.id] || "",
                      );
                      const candidates = rankedCandidates
                        .filter(
                          (candidate) =>
                            !candidateQuery ||
                            normalizeTargetSku(candidate.sku).includes(
                              candidateQuery,
                            ),
                        )
                        .slice(0, 25);
                      const currentSelection = mappingSelection[item.id] || "";
                      const selectedCandidate = rankedCandidates.find(
                        (candidate) => sameSku(candidate.sku, currentSelection),
                      );
                      const draft = getTargetSkuDraft(item.id);
                      const isPending = mappingTab === "pending";
                      const dismissState =
                        dismissedExitItemId === item.id
                          ? "exiting"
                          : dismissingItemId === item.id
                            ? "pending"
                            : "idle";
                      return (
                        <tr
                          key={item.id}
                          data-dismiss-state={dismissState}
                          className={`align-top origin-top transition-all duration-[180ms] motion-reduce:transition-none ${dismissState === "exiting" ? "opacity-0 -translate-y-1 scale-y-75" : "opacity-100 translate-y-0 scale-y-100"}`}
                        >
                          <td className="px-4 py-4 font-semibold text-slate-800">
                            {sourceSku || (
                              <span className="font-normal text-slate-500">
                                （缺少平台 SKU）
                              </span>
                            )}
                          </td>
                          <td className="max-w-[20rem] px-4 py-4 text-slate-600">
                            <p className="line-clamp-2">{item.title || "-"}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.spec || "-"}
                            </p>
                          </td>
                          <td className="px-4 py-4 font-semibold text-slate-800">
                            {formatNumber(item.validSales)}
                          </td>
                          <td className="min-w-[24rem] px-4 py-4">
                            {isPending ? (
                              <div className="space-y-2">
                                <div className="grid grid-cols-[10rem_minmax(13rem,1fr)] gap-2">
                                  <input
                                    aria-label={`为${item.title || sourceSku || "未映射记录"}搜索目标 SKU`}
                                    data-testid={`target-sku-search-${item.id}`}
                                    value={mappingSearch[item.id] || ""}
                                    onChange={(event) =>
                                      setMappingSearch((previous) => ({
                                        ...previous,
                                        [item.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="搜索 SKU"
                                    className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                  />
                                  <CandidatePicker
                                    itemId={item.id}
                                    candidates={candidates}
                                    selectedSku={currentSelection}
                                    selectedCandidate={selectedCandidate}
                                    onChange={(sku) => {
                                      setMappingSelection((previous) => ({
                                        ...previous,
                                        [item.id]: sku,
                                      }));
                                      setMappingDirty((previous) => ({
                                        ...previous,
                                        [item.id]: true,
                                      }));
                                    }}
                                  />
                                </div>
                                {creatingTargetFor[item.id] ? (
                                  <div className="rounded-xl border border-amber-200 bg-white p-3">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <input
                                        aria-label={`新建${item.title || sourceSku || "记录"}的 SKU`}
                                        data-testid={`target-sku-create-code-${item.id}`}
                                        value={draft.sku}
                                        onChange={(event) =>
                                          setTargetSkuDrafts((previous) => ({
                                            ...previous,
                                            [item.id]: {
                                              ...draft,
                                              sku: event.target.value,
                                            },
                                          }))
                                        }
                                        placeholder="新 SKU"
                                        maxLength={200}
                                        className="h-9 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                      />
                                      <input
                                        aria-label={`新建${item.title || sourceSku || "记录"}的名称`}
                                        value={draft.name}
                                        onChange={(event) =>
                                          setTargetSkuDrafts((previous) => ({
                                            ...previous,
                                            [item.id]: {
                                              ...draft,
                                              name: event.target.value,
                                            },
                                          }))
                                        }
                                        placeholder="名称（可选）"
                                        maxLength={500}
                                        className="h-9 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </div>
                                    <div className="mt-2 flex gap-2">
                                      <button
                                        type="button"
                                        data-testid={`target-sku-create-submit-${item.id}`}
                                        onClick={() => createTargetSku(item)}
                                        disabled={
                                          mutationActive ||
                                          creatingItemId === item.id
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {creatingItemId === item.id ? (
                                          <Loader2
                                            size={13}
                                            className="animate-spin"
                                          />
                                        ) : null}
                                        {creatingItemId === item.id
                                          ? "创建中"
                                          : "创建并选择"}
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`target-sku-create-cancel-${item.id}`}
                                        onClick={() =>
                                          cancelTargetSkuCreation(item.id)
                                        }
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="font-semibold text-slate-800">
                                {item.targetSku}
                              </span>
                            )}
                          </td>
                          <td className="sticky right-0 bg-amber-50/95 px-4 py-4 shadow-[-8px_0_12px_-12px_rgba(15,23,42,.5)]">
                            <div className="flex min-w-[15rem] items-center gap-2">
                              {isPending ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => saveMapping(item)}
                                    disabled={
                                      mutationActive ||
                                      !currentSelection ||
                                      savingItemId === item.id ||
                                      dismissState !== "idle"
                                    }
                                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {savingItemId === item.id ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : null}
                                    保存映射
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => dismissMapping(item)}
                                    disabled={
                                      mutationActive ||
                                      dismissState !== "idle"
                                    }
                                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                  >
                                    {dismissState === "pending" ? (
                                      <Loader2
                                        size={13}
                                        className="animate-spin"
                                      />
                                    ) : null}
                                    取消映射
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`target-sku-quick-create-${item.id}`}
                                    onClick={() =>
                                      quickCreateTargetSkuAndSaveMapping(item)
                                    }
                                    disabled={
                                      mutationActive ||
                                      dismissState !== "idle" ||
                                      !normalizeTargetSku(item.platformSku || "")
                                    }
                                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {quickCreatingItemId === item.id ? (
                                      <Loader2
                                        size={13}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Plus size={13} />
                                    )}
                                    {quickCreatingItemId === item.id
                                      ? "创建并映射中"
                                      : "快速新建 SKU"}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`target-sku-create-toggle-${item.id}`}
                                    disabled={dismissState !== "idle"}
                                    onClick={() =>
                                      setCreatingTargetFor((previous) => ({
                                        ...previous,
                                        [item.id]: !previous[item.id],
                                      }))
                                    }
                                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                                  >
                                    <Plus size={13} />
                                    新建 SKU
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-emerald-700">
                                  已保存
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredQueue.length ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          {mappingTab === "pending"
                            ? "当前没有待审核映射。"
                            : "当前没有已映射记录。"}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {filteredQueue.length ? (
                <nav
                  aria-label="映射队列分页"
                  className="flex flex-col gap-2 border-t border-amber-200 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p>
                    第 {queuePage} / {queuePageCount} 页 · 共{" "}
                    {filteredQueue.length} 条
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-label="上一页"
                      disabled={queuePage <= 1}
                      onClick={() =>
                        setQueuePage((page) => Math.max(1, page - 1))
                      }
                      className="h-9 rounded-lg border border-amber-300 bg-white px-3 font-semibold transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      aria-label="下一页"
                      disabled={queuePage >= queuePageCount}
                      onClick={() =>
                        setQueuePage((page) =>
                          Math.min(queuePageCount, page + 1),
                        )
                      }
                      className="h-9 rounded-lg border border-amber-300 bg-white px-3 font-semibold transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      下一页
                    </button>
                  </div>
                </nav>
              ) : null}
              </> : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold text-blue-600">步骤 3</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  计算补货建议
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  按已映射销量、元仓可用库存和有效在途计算；未映射记录已排除。
                </p>
              </div>
              <button
                type="button"
                onClick={requestRecommendations}
                disabled={loading || !salesImport}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {loading ? "计算中" : "开始计算补货建议"}
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-sm font-medium text-slate-700">
                计划日期
                <input
                  aria-label="计划日期"
                  type="date"
                  value={planningDate}
                  onChange={(event) => setPlanningDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                补货时效（天）
                <input
                  aria-label="补货时效"
                  type="number"
                  min={0}
                  max={MAX_PLANNING_DAYS}
                  value={leadTimeDays}
                  onChange={(event) =>
                    setLeadTimeDays(Number(event.target.value) || 0)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                目标到货覆盖日
                <input
                  aria-label="目标到货覆盖日"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                安全库存（天）
                <input
                  aria-label="安全库存"
                  type="number"
                  min={0}
                  max={MAX_PLANNING_DAYS}
                  value={safetyDays}
                  onChange={(event) =>
                    setSafetyDays(Number(event.target.value) || 0)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                增长率（%）
                <input
                  aria-label="增长率"
                  type="number"
                  min={0}
                  max={MAX_GROWTH_PERCENT}
                  value={growthPercent}
                  onChange={(event) =>
                    setGrowthPercent(Number(event.target.value) || 0)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              预计到仓日：{arrivalDate || "-"}。最终数量向上取整；基础补货量为 0
              时不补货。
            </p>
          </section>

          {mappedItems.length ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-900">
                  SKU 单独覆盖（留空即使用全局参数）
                </h3>
                <button
                  type="button"
                  aria-expanded={!rulesSectionCollapsed}
                  aria-label={`${rulesSectionCollapsed ? "展开" : "折叠"} SKU 单独覆盖`}
                  onClick={() =>
                    setRulesSectionCollapsed((collapsed) => !collapsed)
                  }
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {rulesSectionCollapsed ? "展开" : "折叠"}
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-[160ms] ${rulesSectionCollapsed ? "" : "rotate-180"}`}
                  />
                </button>
              </div>
              {!rulesSectionCollapsed ? (
                <div className="mt-3 overflow-x-auto">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="border-b text-left text-slate-500">
                    <tr>
                      <th className="p-2">本地 SKU</th>
                      <th className="p-2">补货时效</th>
                      <th className="p-2">安全库存</th>
                      <th className="p-2">增长率</th>
                      <th className="p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set(mappedItems.map((item) => item.targetSku || "")),
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
              ) : null}
            </section>
          ) : null}

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
                </p>
                <table
                  aria-label="补货建议明细"
                  className="min-w-[800px] w-full text-sm"
                >
                  <thead className="border-b text-left text-slate-500">
                    <tr>
                      {sortableResultHeader("sku", "本地 SKU")}
                      {sortableResultHeader("dailySales", "日销")}
                      {sortableResultHeader(
                        "arrivalDate",
                        "到仓日 / 覆盖天数",
                      )}
                      {sortableResultHeader("availableStock", "元仓可用")}
                      {sortableResultHeader("inTransit", "在途")}
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
                        <td className="p-2 font-semibold">{item.sku}</td>
                        <td className="p-2">
                          {formatNumber(item.dailySales, 2)}
                        </td>
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
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                确认销量批次并设置日期后，即可生成补货建议。
              </div>
            )}
          </section>
        </fieldset>
      </div>
      {excludedOversizedSkus.length ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="未计入补货计算的 SKU"
          className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  未计入补货计算的 SKU
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  以下 {excludedOversizedSkus.length} 个 SKU 超过 50
                  个字符，元仓库存接口无法查询，因此未参与本次补货计算。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭 SKU 排除明细"
                onClick={() => setExcludedOversizedSkus([])}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3">
              {excludedOversizedSkus.map((sku) => (
                <li
                  key={sku}
                  className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-sm"
                >
                  {sku}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setExcludedOversizedSkus([])}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingSiteChange ? (
        <div
          ref={siteDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-change-title"
          aria-describedby="site-change-description"
          aria-label="确认切换站点"
          onKeyDown={handleSiteDialogKeyDown}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="site-change-title"
                  className="text-lg font-bold text-slate-900"
                >
                  存在未保存的映射内容
                </h3>
                <p
                  id="site-change-description"
                  className="mt-2 text-sm leading-6 text-slate-600"
                >
                  切换到“{pendingSiteChange.label || pendingSiteChange.code}
                  ”会清除本页未保存的选择和新建 SKU 草稿，并加载该站点最新批次。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭切换站点确认"
                onClick={closeSiteChangeDialog}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={stayOnSiteButtonRef}
                type="button"
                onClick={closeSiteChangeDialog}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                留在当前站点
              </button>
              <button
                type="button"
                onClick={confirmSiteChange}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                继续切换
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
