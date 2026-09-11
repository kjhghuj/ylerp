/**
 * 库存池管理抽屉：创建（名称+站点+从元仓真实仓库多选）、删除、重叠提醒。
 * 仓库列表来自 /restock-v3/warehouses（接口失败明确报错，不静默变空列表）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import Drawer from './ui/Drawer';
import type { RestockShop, StockPool } from '../types';
import * as restockApi from '../api';
import { formatDateTime } from '../labels';

interface PoolManagerDrawerProps {
  open: boolean;
  onClose: () => void;
  pools: StockPool[];
  shops: RestockShop[];
  canEdit: boolean;
  onPoolsChanged: () => void;
  onNotice: (message: string) => void;
}

interface YcWarehouse {
  code: string;
  name: string | null;
  siteCode: string | null;
}

export default function PoolManagerDrawer(props: PoolManagerDrawerProps) {
  const { open, onClose, pools, shops, canEdit, onPoolsChanged, onNotice } = props;
  const [warehouses, setWarehouses] = useState<YcWarehouse[] | null>(null);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [site, setSite] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWarehouses = useCallback(async () => {
    setWarehousesError(null);
    try {
      const payload = await restockApi.fetchYcWarehouses();
      setWarehouses(payload.warehouses);
    } catch (loadError) {
      setWarehouses(null);
      setWarehousesError(loadError instanceof Error ? loadError.message : '获取元仓仓库失败');
    }
  }, []);

  useEffect(() => {
    if (open) void loadWarehouses();
  }, [open, loadWarehouses]);

  const sites = useMemo(() => {
    const set = new Set<string>();
    for (const shop of shops) set.add(shop.site);
    for (const warehouse of warehouses ?? []) {
      if (warehouse.siteCode) set.add(warehouse.siteCode);
    }
    return Array.from(set).sort();
  }, [shops, warehouses]);

  const effectiveSite = site || sites[0] || '';
  const siteWarehouses = (warehouses ?? []).filter(warehouse =>
    !effectiveSite || warehouse.siteCode === effectiveSite);

  /** 重叠提醒：新选仓库与现有池的重叠 */
  const overlapWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const code of selectedCodes) {
      const owners = pools.filter(pool => pool.warehouseCodes.includes(code)).map(pool => pool.name);
      if (owners.length > 0) {
        warnings.push(`仓库 ${code} 已被库存池「${owners.join('、')}」使用——同一库存被多个规划视图共享时，请注意计划间的冲突与执行约束`);
      }
    }
    return warnings;
  }, [selectedCodes, pools]);

  const resetForm = () => {
    setName('');
    setSelectedCodes(new Set());
    setCreating(false);
    setError(null);
  };

  const create = async () => {
    if (!name.trim() || selectedCodes.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await restockApi.createPool({ name: name.trim(), site: effectiveSite, warehouseCodes: Array.from(selectedCodes) });
      onNotice('库存池已创建');
      resetForm();
      onPoolsChanged();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建库存池失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (pool: StockPool) => {
    setBusy(true);
    setError(null);
    try {
      await restockApi.deletePool(pool.id);
      onNotice(`库存池「${pool.name}」已删除`);
      onPoolsChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除库存池失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="库存池" subtitle="需求店铺 ↔ 供应仓库范围的关联；确认计划需使用明确范围" width={520}>
      {error && <p className="text-xs mb-2" style={{ color: '#b91c1c' }} role="alert">{error}</p>}

      {canEdit && (creating ? (
        <div className="rounded-lg border p-3 mb-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>池名称</span>
              <input
                autoFocus
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={100}
                aria-label="库存池名称"
                className="rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </label>
            <label className="flex flex-col gap-1 w-28">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>站点</span>
              <select
                value={effectiveSite}
                onChange={event => { setSite(event.target.value); setSelectedCodes(new Set()); }}
                aria-label="库存池站点"
                className="rounded-lg border px-2 py-1.5 text-[13px]"
                style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                {sites.map(candidate => <option key={candidate} value={candidate}>{candidate}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            选择仓库（{siteWarehouses.length} 个可用{warehouses === null ? '，加载中…' : ''}）：
          </p>
          {warehousesError ? (
            <p className="text-xs mb-2" style={{ color: '#b91c1c' }} role="alert">
              {warehousesError}
              <button type="button" className="ml-2 underline" onClick={() => void loadWarehouses()}>重试</button>
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-lg border p-2 mb-2" style={{ borderColor: 'var(--border-light)' }}>
              {siteWarehouses.map(warehouse => (
                <label key={warehouse.code} className="flex items-center gap-2 py-0.5 text-[13px] cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={selectedCodes.has(warehouse.code)}
                    onChange={() => setSelectedCodes(previous => {
                      const next = new Set(previous);
                      if (next.has(warehouse.code)) next.delete(warehouse.code);
                      else next.add(warehouse.code);
                      return next;
                    })}
                    aria-label={`选择仓库 ${warehouse.code}`}
                  />
                  <span className="flex-1 truncate">{warehouse.code}{warehouse.name ? ` · ${warehouse.name}` : ''}</span>
                </label>
              ))}
              {warehouses !== null && siteWarehouses.length === 0 && (
                <p className="text-xs py-1" style={{ color: 'var(--text-tertiary)' }}>该站点暂无仓库</p>
              )}
            </div>
          )}
          {overlapWarnings.map(warning => (
            <p key={warning} className="flex items-start gap-1 text-[11px] mb-1" style={{ color: '#b45309' }}>
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              {warning}
            </p>
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="rounded-lg border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>
              取消
            </button>
            <button
              type="button"
              disabled={!name.trim() || selectedCodes.size === 0 || busy}
              onClick={() => void create()}
              className="rounded-lg px-3 py-1 text-xs text-white font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              创建（{selectedCodes.size} 仓）
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs mb-3"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          <Plus size={13} />
          新建库存池
        </button>
      ))}

      {pools.length === 0 && <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>暂无库存池。未选择库存池时计算将使用整站仓库（仅可预览，确认计划需明确范围）。</p>}
      <div className="flex flex-col gap-2">
        {pools.map(pool => (
          <div key={pool.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{pool.name}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>
                {pool.site}
              </span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              仓库：{pool.warehouseCodes.join('、')} · 创建于 {formatDateTime(pool.createdAt)}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              关联店铺：同站点店铺可选此池（{shops.filter(shop => shop.site === pool.site).map(shop => shop.name).join('、') || '暂无'}）
            </p>
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(pool)}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] mt-1.5 disabled:opacity-40"
                style={{ borderColor: 'var(--border-light)', color: '#dc2626' }}
              >
                <Trash2 size={12} />
                删除
              </button>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}
