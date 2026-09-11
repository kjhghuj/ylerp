/** 顶部固定工具栏：店铺（多选）/库存池/区间预设/参数摘要/刷新源数据/重新计算 */
import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Layers, RefreshCw, Settings2, SlidersHorizontal, Store, Zap } from 'lucide-react';
import type { RestockShop, StockPool } from '../types';
import type { RangePreset, WorkbenchParams } from '../useWorkbench';
import { formatNumber } from '../labels';

interface ToolbarProps {
  shops: RestockShop[];
  shopsLoading: boolean;
  pools: StockPool[];
  selectedShopIds: string[];
  onShopIdsChange: (ids: string[]) => void;
  poolId: string | null;
  onPoolChange: (poolId: string | null) => void;
  rangePreset: RangePreset;
  onPresetChange: (preset: RangePreset) => void;
  fromDate: string;
  toDate: string;
  onRangeChange: (from: string, to: string) => void;
  params: WorkbenchParams;
  onOpenParams: () => void;
  onOpenPools: () => void;
  computing: boolean;
  /** 保存计划期间锁定条件，防止保存与状态变化交叉造成版本混用 */
  planSaving: boolean;
  hasResult: boolean;
  onRefreshSource: () => void;
  onRecompute: () => void;
  onCompute: () => void;
}

const PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: '7d', label: '近7天' },
  { key: '14d', label: '近14天' },
  { key: '30d', label: '近30天' },
  { key: 'custom', label: '自定义' },
];

export default function Toolbar(props: ToolbarProps) {
  const {
    shops, shopsLoading, pools, selectedShopIds, onShopIdsChange,
    poolId, onPoolChange, rangePreset, onPresetChange,
    fromDate, toDate, onRangeChange, params, onOpenParams, onOpenPools,
    computing, planSaving, hasResult, onRefreshSource, onRecompute, onCompute,
  } = props;

  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const shopMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shopMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (shopMenuRef.current && !shopMenuRef.current.contains(event.target as Node)) {
        setShopMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [shopMenuOpen]);

  const selectedSite = shops.find(shop => shop.id === selectedShopIds[0])?.site ?? null;
  const availablePools = pools.filter(pool => !selectedSite || pool.site === selectedSite);
  const selectedShopNames = selectedShopIds
    .map(id => shops.find(shop => shop.id === id)?.name)
    .filter(Boolean) as string[];

  const toggleShop = (id: string) => {
    const site = shops.find(shop => shop.id === id)?.site;
    const currentSite = selectedShopIds.length > 0
      ? shops.find(shop => shop.id === selectedShopIds[0])?.site
      : undefined;
    // 共仓模式要求同站点：不同站点店铺不可混选
    if (selectedShopIds.includes(id)) {
      onShopIdsChange(selectedShopIds.filter(value => value !== id));
    } else if (site === currentSite || selectedShopIds.length === 0) {
      onShopIdsChange([...selectedShopIds, id]);
    }
  };

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-4 py-2.5"
      style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)' }}
    >
      {/* 店铺多选 */}
      <div className="relative" ref={shopMenuRef}>
        <button
          type="button"
          onClick={() => setShopMenuOpen(open => !open)}
          aria-haspopup="listbox"
          aria-expanded={shopMenuOpen}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] min-w-[120px] max-w-[260px]"
          style={{
            borderColor: 'var(--border-light)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <Store size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span className="truncate flex-1 text-left">
            {shopsLoading ? '加载店铺…' : selectedShopNames.length > 0
              ? selectedShopNames.length === 1 ? selectedShopNames[0] : `${selectedShopNames[0]} 等${selectedShopNames.length}店`
              : '选择店铺'}
          </span>
          <ChevronDown size={13} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        {shopMenuOpen && (
          <div
            className="absolute left-0 top-full mt-1 rounded-lg border shadow-lg py-1 z-30 max-h-72 overflow-y-auto min-w-[240px]"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
            role="listbox"
            aria-multiselectable="true"
          >
            {shops.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                暂无商品分析店铺，请先在商品分析中添加并上传日报
              </p>
            )}
            {shops.map(shop => {
              const checked = selectedShopIds.includes(shop.id);
              return (
                <label
                  key={shop.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleShop(shop.id)}
                    aria-label={`选择店铺 ${shop.name}`}
                  />
                  <span className="flex-1 truncate">{shop.name}（{shop.site}）</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {shop.latestUploadDate ?? '无上传'}
                  </span>
                </label>
              );
            })}
            {selectedShopIds.length > 1 && (
              <p className="px-3 py-1.5 text-[11px] border-t" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-light)' }}>
                已选 {selectedShopIds.length} 店（共仓模式：需求汇总后扣一次库存）
              </p>
            )}
          </div>
        )}
      </div>

      {/* 区间预设 */}
      <div
        className="flex items-center rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-light)' }}
        role="group"
        aria-label="统计区间"
      >
        {PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onPresetChange(preset.key)}
            aria-pressed={rangePreset === preset.key}
            className="px-2.5 py-1.5 text-xs transition-colors"
            style={{
              color: rangePreset === preset.key ? '#fff' : 'var(--text-secondary)',
              backgroundColor: rangePreset === preset.key ? 'var(--primary)' : 'transparent',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {rangePreset === 'custom' ? (
        <div className="flex items-center gap-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          <Calendar size={13} />
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={event => onRangeChange(event.target.value, toDate)}
            aria-label="统计开始日期"
            className="rounded-lg border px-2 py-1 text-[13px]"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
          <span>至</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={event => onRangeChange(fromDate, event.target.value)}
            aria-label="统计结束日期"
            className="rounded-lg border px-2 py-1 text-[13px]"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {fromDate && toDate ? `${fromDate} ~ ${toDate}` : '待选择区间'}
        </span>
      )}

      {/* 库存池 */}
      <label className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        <Layers size={13} />
        <select
          value={poolId ?? ''}
          onChange={event => onPoolChange(event.target.value || null)}
          disabled={planSaving}
          aria-label="库存池（仓库范围）"
          className="rounded-lg border px-2 py-1.5 text-[13px] max-w-[160px] disabled:opacity-50"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">整站仓库（默认）</option>
          {availablePools.map(pool => (
            <option key={pool.id} value={pool.id}>{pool.name}（{pool.warehouseCodes.length}仓）</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onOpenPools}
        disabled={planSaving}
        aria-label="管理库存池"
        title="管理库存池（创建 / 删除 / 重叠提醒）"
        className="p-1.5 rounded-lg border disabled:opacity-50"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        <SlidersHorizontal size={13} />
      </button>

      <div className="flex-1" />

      {/* 参数摘要 + 抽屉入口 */}
      <button
        type="button"
        onClick={onOpenParams}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        aria-label="打开参数设置"
      >
        <Settings2 size={13} />
        时效{formatNumber(params.leadTimeDays, 0)}天 · 安全{formatNumber(params.safetyDays, 0)}天 · 增长{formatNumber(params.growthPercent, 0)}%
      </button>

      {/* 操作按钮 */}
      {hasResult ? (
        <>
          <button
            type="button"
            onClick={onRefreshSource}
            disabled={computing}
            aria-label="刷新源数据"
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            title="重新拉取销量与元仓库存/在途（含强制刷新元仓快照）"
          >
            <RefreshCw size={13} className={computing ? 'animate-spin' : undefined} />
            刷新源数据
          </button>
          <button
            type="button"
            onClick={onRecompute}
            disabled={computing}
            aria-label="重新计算"
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
            title="用当前源数据快照按新参数重算（未改源条件时不重复拉取元仓）"
          >
            <Zap size={13} />
            重新计算
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onCompute}
          disabled={computing || shopsLoading}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          <Zap size={13} />
          计算补货建议
        </button>
      )}
    </div>
  );
}
