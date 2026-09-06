import React, { useState } from 'react';
import { X, Plus, Trash2, Pencil, Store } from 'lucide-react';
import { useToast } from '../../../components/Toast';
import {
  createShop,
  deleteShop,
  getApiErrorDetail,
  updateShop,
} from '../services/productAnalysisApi';
import { useProductAnalysisStrings } from '../i18n';
import { SITE_OPTIONS, type ShopMeta } from '../types';

interface ShopManagerProps {
  shops: ShopMeta[];
  onClose: () => void;
  /** 店铺列表发生变化（增删改）后回调，父层负责刷新列表与选中态 */
  onRefresh: () => Promise<void>;
}

/** 店铺管理弹窗：新建（名称+站点）、重命名、删除 */
export const ShopManager: React.FC<ShopManagerProps> = ({ shops, onClose, onRefresh }) => {
  const { showToast } = useToast();
  const strings = useProductAnalysisStrings();
  const [name, setName] = useState('');
  const [site, setSite] = useState<(typeof SITE_OPTIONS)[number]>('MY');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createShop({ name: trimmed, site });
      setName('');
      await onRefresh();
      showToast(`${strings.shop.create} ✓`);
      // 创建成功后自动关闭弹窗，回到主页面（首个店铺会自动选中）
      onClose();
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (shop: ShopMeta) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === shop.name) {
      setRenamingId(null);
      return;
    }
    try {
      await updateShop(shop.id, { name: trimmed });
      await onRefresh();
      setRenamingId(null);
      showToast(`${strings.shop.rename} ✓`);
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    }
  };

  const handleDelete = async (shop: ShopMeta) => {
    if (!window.confirm(`${strings.shop.deleteConfirm}\n（${shop.name} · ${shop.site}）`)) return;
    try {
      await deleteShop(shop.id);
      await onRefresh();
      showToast(`${shop.name} ${strings.shop.delete} ✓`);
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    }
  };

  const inputStyle = {
    backgroundColor: 'var(--bg-primary)',
    borderColor: 'var(--border-light)',
    color: 'var(--text-primary)',
  } as const;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border-light)' }}>
          <p className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Store size={16} style={{ color: 'var(--primary)' }} />
            {strings.shop.manage}
          </p>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }} aria-label="close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {/* 新建 */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{strings.shop.name}</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={50}
                placeholder={strings.shop.name}
                className="rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{strings.shop.site}</label>
              <select
                value={site}
                onChange={(event) => setSite(event.target.value as (typeof SITE_OPTIONS)[number])}
                className="rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                {SITE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
            >
              <Plus size={14} />
              {strings.shop.createBtn}
            </button>
          </div>

          {/* 列表 */}
          <div className="flex flex-col gap-2">
            {shops.map((shop) => (
              <div
                key={shop.id}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
              >
                <div className="min-w-0 flex-1">
                  {renamingId === shop.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) void handleRename(shop);
                        if (event.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => void handleRename(shop)}
                      maxLength={50}
                      className="w-full rounded-lg border px-2 py-1 text-sm"
                      style={inputStyle}
                    />
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {shop.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {shop.site} · {shop.currency} · {shop.dayCount} {strings.shop.dayUnit}
                        {shop.latestUploadDate ? ` · ${strings.shop.latest} ${shop.latestUploadDate}` : ''}
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(shop.id);
                    setRenameValue(shop.name);
                  }}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  title={strings.shop.rename}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(shop)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: '#dc2626' }}
                  title={strings.shop.delete}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {shops.length === 0 && (
              <p className="text-xs text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
                {strings.shop.emptyHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
