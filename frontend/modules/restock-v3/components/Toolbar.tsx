/** Demand shops, source pool, date range and calculation actions. Values remain owned by the workbench. */
import { useState } from 'react';
import { Calendar, ChevronDown, Layers, RefreshCw, Settings2, SlidersHorizontal, Store, Zap } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { NativeSelect } from '../../../components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
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
  planSaving: boolean;
  hasResult: boolean;
  onRefreshSource: () => void;
  onRecompute: () => void;
  onCompute: () => void;
}
const PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: '7d', label: '近7天' }, { key: '14d', label: '近14天' },
  { key: '30d', label: '近30天' }, { key: 'custom', label: '自定义' },
];

export default function Toolbar(props: ToolbarProps) {
  const {
    shops, shopsLoading, pools, selectedShopIds, onShopIdsChange, poolId, onPoolChange,
    rangePreset, onPresetChange, fromDate, toDate, onRangeChange, params,
    onOpenParams, onOpenPools, computing, planSaving, hasResult, onRefreshSource, onRecompute, onCompute,
  } = props;
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const selectedSite = shops.find(shop => shop.id === selectedShopIds[0])?.site ?? null;
  const availablePools = pools.filter(pool => !selectedSite || pool.site === selectedSite);
  const selectedShopNames = selectedShopIds.map(id => shops.find(shop => shop.id === id)?.name).filter(Boolean) as string[];
  const toggleShop = (id: string) => {
    if (planSaving) return;
    const site = shops.find(shop => shop.id === id)?.site;
    if (selectedShopIds.includes(id)) onShopIdsChange(selectedShopIds.filter(value => value !== id));
    else if (!selectedSite || site === selectedSite) onShopIdsChange([...selectedShopIds, id]);
  };
  return <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3 text-card-foreground">
    <Popover open={shopMenuOpen && !planSaving} onOpenChange={setShopMenuOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={planSaving || shopsLoading} className="min-w-[120px] max-w-[260px] justify-start">
          <Store size={14} className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">{shopsLoading ? '加载店铺…' : selectedShopNames.length
            ? selectedShopNames.length === 1 ? selectedShopNames[0] : `${selectedShopNames[0]} 等${selectedShopNames.length}店` : '选择店铺'}</span>
          <ChevronDown size={13} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-[min(320px,90vw)] overflow-y-auto p-1" aria-label="选择需求店铺">
        {!shops.length && <p className="p-3 text-xs text-muted-foreground">暂无商品分析店铺，请先在商品分析中添加并上传日报</p>}
        {shops.map(shop => {
          const checked = selectedShopIds.includes(shop.id);
          const disabled = planSaving || Boolean(selectedSite && shop.site !== selectedSite && !checked);
          return <label key={shop.id} className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent'}`}>
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggleShop(shop.id)} aria-label={`选择店铺 ${shop.name}`} />
            <span className="min-w-0 flex-1 truncate">{shop.name}（{shop.site}）</span>
            <span className="text-[11px] text-muted-foreground">{shop.latestUploadDate ?? '无上传'}</span>
          </label>;
        })}
        {selectedSite && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">共仓模式仅可选择同站点店铺，需求汇总后扣一次库存。</p>}
      </PopoverContent>
    </Popover>
    <div className="flex items-center overflow-hidden rounded-md border border-border" role="group" aria-label="统计区间">
      {PRESETS.map(preset => <Button key={preset.key} variant={rangePreset === preset.key ? 'default' : 'ghost'} size="sm"
        disabled={planSaving} onClick={() => onPresetChange(preset.key)} aria-pressed={rangePreset === preset.key} className="rounded-none px-2.5">{preset.label}</Button>)}
    </div>
    {rangePreset === 'custom' ? <div className="flex max-w-full flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
      <Calendar size={13} />
      <Input type="date" value={fromDate} max={toDate} disabled={planSaving} onChange={event => onRangeChange(event.target.value, toDate)} aria-label="统计开始日期" className="h-8 w-[145px] text-xs" />
      <span>至</span>
      <Input type="date" value={toDate} min={fromDate} disabled={planSaving} onChange={event => onRangeChange(fromDate, event.target.value)} aria-label="统计结束日期" className="h-8 w-[145px] text-xs" />
    </div> : <span className="text-xs text-muted-foreground">{fromDate && toDate ? `${fromDate} ~ ${toDate}` : '待选择区间'}</span>}
    <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <Layers size={13} />
      <NativeSelect value={poolId ?? ''} onChange={event => onPoolChange(event.target.value || null)} disabled={planSaving}
        aria-label="库存池（仓库范围）" className="h-8 max-w-[180px] text-xs">
        <option value="">整站仓库（默认）</option>
        {availablePools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}（{pool.warehouseCodes.length}仓）</option>)}
      </NativeSelect>
    </label>
    <Button variant="outline" size="icon" onClick={onOpenPools} disabled={planSaving} aria-label="管理库存池" title="管理库存池（创建 / 删除 / 重叠提醒）" className="h-8 w-8"><SlidersHorizontal size={13} /></Button>
    <div className="flex-1" />
    <Button variant="outline" size="sm" onClick={onOpenParams} disabled={planSaving} aria-label="打开参数设置">
      <Settings2 size={13} />时效{formatNumber(params.leadTimeDays, 0)}天 · 安全{formatNumber(params.safetyDays, 0)}天 · 增长{formatNumber(params.growthPercent, 0)}%
    </Button>
    {hasResult ? <>
      <Button variant="outline" size="sm" onClick={onRefreshSource} disabled={computing || planSaving} aria-label="刷新源数据" title="重新拉取销量与元仓库存/在途（含强制刷新元仓快照）"><RefreshCw size={13} className={computing ? 'animate-spin' : undefined} />刷新源数据</Button>
      <Button size="sm" onClick={onRecompute} disabled={computing || planSaving} aria-label="重新计算" title="用当前源数据快照按新参数重算（未改源条件时不重复拉取元仓）"><Zap size={13} />重新计算</Button>
    </> : <Button size="sm" onClick={onCompute} disabled={computing || shopsLoading || planSaving}><Zap size={13} />计算补货建议</Button>}
  </div>;
}
