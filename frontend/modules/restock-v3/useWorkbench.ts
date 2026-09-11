/**
 * 补货工作台状态机：条件 → 计算 → 结果版本（stale 失效）→ 确认编辑 → 计划保存。
 *
 * 版本控制：plan 绑定计算时的完整条件键（含映射/规则版本号 dataRevision）。
 * 店铺/区间/池/参数/映射/规则任一变化 → isStale=true → 禁止按新条件导出或保存旧结果。
 * 异步竞态：compute 请求带自增 token，过期响应直接丢弃。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as restockApi from './api';
import type { ComputeResult, ConfirmEdit, PlanListItem, RestockShop, StockPool } from './types';

export type RangePreset = '7d' | '14d' | '30d' | 'custom';

export interface WorkbenchParams {
  planningDate: string;
  targetDate: string;
  leadTimeDays: number;
  safetyDays: number;
  growthPercent: number;
  statisticsDaysMode: 'auto' | 'custom';
  statisticsDaysCustom: string;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const addDaysIso = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`).getTime();
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
};

const DEFAULT_PARAMS: WorkbenchParams = {
  planningDate: todayIso(),
  targetDate: addDaysIso(todayIso(), 90),
  leadTimeDays: 25,
  safetyDays: 30,
  growthPercent: 0,
  statisticsDaysMode: 'auto',
  statisticsDaysCustom: '',
};

export interface InitialWorkbenchParams {
  shopId?: string;
  from?: string;
  to?: string;
}

export function useWorkbench(initial?: InitialWorkbenchParams) {
  // ---- 基础数据 ----
  const [shops, setShops] = useState<RestockShop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const [pools, setPools] = useState<StockPool[]>([]);

  // ---- 条件 ----
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>(initial?.shopId ? [initial.shopId] : []);
  const [rangePreset, setRangePreset] = useState<RangePreset>(initial?.from && initial?.to ? 'custom' : '30d');
  const [fromDate, setFromDate] = useState(initial?.from ?? '');
  const [toDate, setToDate] = useState(initial?.to ?? '');
  const [poolId, setPoolId] = useState<string | null>(null);
  const [params, setParams] = useState<WorkbenchParams>(DEFAULT_PARAMS);

  // 映射/规则修改计数：变化 → 结果过期
  const [dataRevision, setDataRevision] = useState(0);
  const bumpDataRevision = useCallback(() => setDataRevision(value => value + 1), []);

  // ---- 计算结果与版本 ----
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 刷新源数据失败：保留旧结果继续展示，但明确标记其属于旧快照，
   * 禁止保存/导出/复制（旧结果不能再作为有效结果使用）。
   */
  const [refreshFailed, setRefreshFailed] = useState(false);
  const computeTokenRef = useRef(0);
  /** 本次结果对应的完整条件键 */
  const [resultConditionKey, setResultConditionKey] = useState<string | null>(null);

  // ---- 确认编辑与选择 ----
  const [edits, setEdits] = useState<Record<string, ConfirmEdit>>({});
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

  // ---- 计划 ----
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);
  const [planSaving, setPlanSaving] = useState(false);

  // ---- 条件键：结果与当前条件的比对依据 ----
  const currentConditionKey = useMemo(() => JSON.stringify({
    shopIds: [...selectedShopIds].sort(),
    from: fromDate,
    to: toDate,
    poolId,
    planningDate: params.planningDate,
    targetDate: params.targetDate,
    leadTimeDays: params.leadTimeDays,
    safetyDays: params.safetyDays,
    growthPercent: params.growthPercent,
    statisticsDaysMode: params.statisticsDaysMode,
    statisticsDaysCustom: params.statisticsDaysCustom,
    dataRevision,
  }), [selectedShopIds, fromDate, toDate, poolId, params, dataRevision]);

  const isStale = result !== null && resultConditionKey !== currentConditionKey;
  /** 批量操作统一门槛：条件未过期 ∧ 最近一次刷新未失败 ∧ 有结果 */
  const canBatch = result !== null && !isStale && !refreshFailed;

  // ---- 店铺加载 ----
  const loadShops = useCallback(async () => {
    setShopsLoading(true);
    setShopsError(null);
    try {
      const [shopList, poolList] = await Promise.all([
        restockApi.fetchShops(),
        restockApi.fetchPools().catch(() => ({ pools: [] as StockPool[] })),
      ]);
      setShops(shopList);
      setPools(poolList.pools);
    } catch (error) {
      setShopsError(error instanceof Error ? error.message : '获取店铺列表失败');
    } finally {
      setShopsLoading(false);
    }
  }, []);

  useEffect(() => { void loadShops(); }, [loadShops]);

  // 无初始店铺时默认选第一个店铺（只做一次）
  const defaultShopPickedRef = useRef(false);
  useEffect(() => {
    if (defaultShopPickedRef.current || initial?.shopId) return;
    if (shops.length > 0 && selectedShopIds.length === 0) {
      defaultShopPickedRef.current = true;
      setSelectedShopIds([shops[0].id]);
    }
  }, [shops, selectedShopIds.length, initial?.shopId]);

  // 店铺变化（初始未带区间）：默认区间 = 最新上传日往前 29 天
  const defaultRangeShopRef = useRef<string | null>(null);
  useEffect(() => {
    if (rangePreset === 'custom' && initial?.from) return;
    const key = [...selectedShopIds].sort().join(',');
    if (!key || defaultRangeShopRef.current === key) return;
    defaultRangeShopRef.current = key;
    const latest = selectedShopIds
      .map(id => shops.find(shop => shop.id === id)?.latestUploadDate)
      .filter((date): date is string => Boolean(date))
      .sort()
      .pop();
    if (latest) {
      setRangePreset('30d');
      setToDate(latest);
      setFromDate(addDaysIso(latest, -29));
    }
  }, [selectedShopIds, shops, rangePreset, initial?.from]);

  // 预设区间切换：以最新上传日为锚（无上传时用今天）
  const applyPreset = useCallback((preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === 'custom') return;
    const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
    const latest = selectedShopIds
      .map(id => shops.find(shop => shop.id === id)?.latestUploadDate)
      .filter((date): date is string => Boolean(date))
      .sort()
      .pop() ?? todayIso();
    setToDate(latest);
    setFromDate(addDaysIso(latest, -(days - 1)));
  }, [selectedShopIds, shops]);

  // ---- 计算 ----
  const compute = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (selectedShopIds.length === 0) {
      setComputeError('请先选择店铺');
      return;
    }
    if (!fromDate || !toDate || fromDate > toDate) {
      setComputeError('请选择有效的统计区间');
      return;
    }
    const statisticsDays = params.statisticsDaysMode === 'custom'
      ? Number.parseInt(params.statisticsDaysCustom, 10)
      : null;
    if (params.statisticsDaysMode === 'custom' && (!Number.isInteger(statisticsDays) || (statisticsDays as number) < 1)) {
      setComputeError('自定义统计天数需为 ≥1 的整数');
      return;
    }
    const token = ++computeTokenRef.current;
    setComputing(true);
    setComputeError(null);
    const isRefresh = options?.forceRefresh === true;
    try {
      const payload = await restockApi.computeRecommendations({
        shopIds: selectedShopIds,
        poolId,
        from: fromDate,
        to: toDate,
        planningDate: params.planningDate,
        targetDate: params.targetDate,
        leadTimeDays: params.leadTimeDays,
        safetyDays: params.safetyDays,
        growthPercent: params.growthPercent,
        statisticsDays,
        forceRefresh: options?.forceRefresh,
      });
      if (computeTokenRef.current !== token) return; // 过期响应丢弃
      const conditionKey = JSON.stringify({
        shopIds: [...selectedShopIds].sort(),
        from: fromDate, to: toDate, poolId,
        planningDate: params.planningDate,
        targetDate: params.targetDate,
        leadTimeDays: params.leadTimeDays,
        safetyDays: params.safetyDays,
        growthPercent: params.growthPercent,
        statisticsDaysMode: params.statisticsDaysMode,
        statisticsDaysCustom: params.statisticsDaysCustom,
        dataRevision,
      });
      setResult(payload);
      setResultConditionKey(conditionKey);
      setRefreshFailed(false);
      setEdits({});
      setSelectedSkus(new Set());
    } catch (error) {
      if (computeTokenRef.current !== token) return;
      setComputeError(error instanceof Error ? error.message : '计算补货建议失败');
      if (isRefresh && result) {
        // 刷新失败：保留旧结果但标记其属于旧快照（禁保存/导出/复制）
        setRefreshFailed(true);
      }
    } finally {
      if (computeTokenRef.current === token) setComputing(false);
    }
  }, [selectedShopIds, fromDate, toDate, poolId, params, dataRevision, result]);

  // 条件变化时清提示
  useEffect(() => { setNotice(null); }, [currentConditionKey]);

  // ---- 编辑/选择 ----
  const setEdit = useCallback((sku: string, edit: ConfirmEdit | null) => {
    setEdits(previous => {
      const next = { ...previous };
      if (edit === null) delete next[sku];
      else next[sku] = edit;
      return next;
    });
  }, []);

  const toggleSelected = useCallback((sku: string) => {
    setSelectedSkus(previous => {
      const next = new Set(previous);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }, []);

  const setSelected = useCallback((skus: string[]) => {
    setSelectedSkus(new Set(skus));
  }, []);

  // ---- 计划 ----
  const refreshPlans = useCallback(async () => {
    try {
      const payload = await restockApi.fetchPlans();
      setPlans(payload.plans);
    } catch {
      setPlans([]);
    }
  }, []);

  /** 前端预检：与后端同一套可执行校验（不可执行项不能通过手工填数量绕过） */
  const isItemExecutable = useCallback((sku: string): boolean => {
    if (!result) return false;
    const item = result.items.find(candidate => candidate.sku === sku);
    if (!item) return false;
    return item.executable === true && item.salesQuality.executable !== false;
  }, [result]);

  const savePlanFromResult = useCallback(async (name: string, skus: string[]) => {
    if (!result) throw new Error('没有可保存的结果');
    if (isStale) throw new Error('结果已过期，请重新计算后再保存');
    if (refreshFailed) throw new Error('源数据刷新失败，当前展示的是旧快照，请刷新成功后再保存');
    if (!result.resultId) throw new Error('结果缺少服务端快照 ID，请重新计算');
    const nonExecutable = skus.filter(sku => !isItemExecutable(sku));
    if (nonExecutable.length > 0) {
      throw new Error(`以下商品不可执行（库存未知/零销量/数据质量不足），已从保存中排除或请取消勾选：${nonExecutable.join('、')}`);
    }
    const items = result.items
      .filter(item => skus.includes(item.sku))
      .map(item => {
        const edit = edits[item.sku];
        const confirmedQty = edit?.confirmedQty ?? null;
        const adjustReason = edit?.adjustReason || null;
        if (confirmedQty !== null && confirmedQty !== item.suggestedQty && !adjustReason) {
          throw new Error(`${item.sku}：确认补货量与建议量不一致时必须填写调整原因`);
        }
        return {
          sku: item.sku,
          confirmedQty,
          adjustReason,
        };
      });
    if (items.length === 0) throw new Error('请先选择要保存的 SKU');
    setPlanSaving(true);
    try {
      // 幂等键：组件会话内唯一，双击/重试由后端幂等处理
      const idempotencyKey = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `v3-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload = await restockApi.savePlan({
        resultId: result.resultId,
        name,
        items,
        idempotencyKey,
      });
      await refreshPlans();
      return payload.plan;
    } finally {
      setPlanSaving(false);
    }
  }, [result, isStale, refreshFailed, edits, isItemExecutable, refreshPlans]);

  return {
    // 基础数据
    shops, shopsLoading, shopsError, pools,
    loadShops,
    // 条件
    selectedShopIds, setSelectedShopIds,
    rangePreset, applyPreset, setRangePreset,
    fromDate, setFromDate, toDate, setToDate,
    poolId, setPoolId,
    params, setParams,
    dataRevision, bumpDataRevision,
    // 结果与版本
    result, computing, computeError, computeNotice: notice, setComputeNotice: setNotice,
    isStale, refreshFailed, canBatch, compute,
    // 编辑与选择
    edits, setEdit, selectedSkus, toggleSelected, setSelectedSkus: setSelected,
    isItemExecutable,
    // 计划
    plans, planSaving, refreshPlans, savePlanFromResult,
  };
}
