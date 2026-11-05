import { FormSelect } from '../../../components/FormSelect';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import React, { useEffect, useRef, useState } from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../../../components/ui/dialog';
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
import { DeleteConfirmation } from './DeleteConfirmation';

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
  const renameInput = useRef<HTMLInputElement>(null);
  const createInput = useRef<HTMLInputElement>(null);
  const [deletingShop, setDeletingShop] = useState<ShopMeta | null>(null);
  useEffect(() => { if (renamingId) renameInput.current?.focus(); }, [renamingId]);

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
    try {
      await deleteShop(shop.id);
      await onRefresh();
      showToast(`${shop.name} ${strings.shop.delete} ✓`);
      return true;
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
      return false;
    }
  };

  const inputStyle = {
    backgroundColor: 'var(--pa-canvas)',
    borderColor: 'var(--pa-card-border)',
    color: 'hsl(var(--ui-foreground))',
  } as const;

  return (
    <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
      <DialogContent showCloseButton={false} className="rounded-xl max-w-[min(512px,calc(100vw-2rem))] max-h-[85dvh] flex flex-col overflow-hidden gap-0 p-0">
        <DialogDescription className="sr-only">{strings.shop.manage}</DialogDescription>
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--pa-card-border)' }}>
          <DialogTitle className="font-bold text-sm flex items-center gap-2">
            <Store size={16} style={{ color: 'var(--pa-accent-text)' }} />
            {strings.shop.manage}
          </DialogTitle>
          <Button variant="ghost" type="button" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'hsl(var(--ui-muted-foreground))' }} aria-label="close">
            <X size={18} />
          </Button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {/* 新建 */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
              <label htmlFor="pa-create-shop-name" className="text-xs font-medium" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{strings.shop.name}</label>
              <Input
                ref={createInput}
                id="pa-create-shop-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={50}
                placeholder={strings.shop.name}
                className="rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pa-create-shop-site" className="text-xs font-medium" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{strings.shop.site}</label>
              <FormSelect
                id="pa-create-shop-site"
                value={site}
                onValueChange={(value) => setSite(value as (typeof SITE_OPTIONS)[number])}
                triggerClassName="h-8 w-auto rounded-lg border px-3 text-sm"
                options={SITE_OPTIONS.map((option) => ({ value: option, label: option }))}
              />
            </div>
            <Button variant="default"
              type="button"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--pa-accent-ui)', color: 'var(--pa-on-accent)' }}
            >
              <Plus size={14} />
              {strings.shop.createBtn}
            </Button>
          </div>

          {/* 列表 */}
          <div className="flex flex-col gap-2">
            {shops.map((shop) => (
              <div
                key={shop.id}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: 'var(--pa-canvas)', borderColor: 'var(--pa-card-border)' }}
              >
                <div className="min-w-0 flex-1">
                  {renamingId === shop.id ? (
                    <Input
                      ref={renameInput}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) void handleRename(shop);
                        if (event.key === 'Escape') { event.stopPropagation(); setRenamingId(null); }
                      }}
                      onBlur={() => void handleRename(shop)}
                      maxLength={50}
                      className="w-full rounded-lg border px-2 py-1 text-sm"
                      style={inputStyle}
                    />
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--ui-foreground))' }}>
                        {shop.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
                        {shop.site} · {shop.currency} · {shop.dayCount} {strings.shop.dayUnit}
                        {shop.latestUploadDate ? ` · ${strings.shop.latest} ${shop.latestUploadDate}` : ''}
                      </p>
                    </>
                  )}
                </div>
                <Button variant="ghost"
                  type="button"
                  onClick={() => {
                    setRenamingId(shop.id);
                    setRenameValue(shop.name);
                  }}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'hsl(var(--ui-muted-foreground))' }}
                  title={strings.shop.rename}
                >
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost"
                  type="button"
                  onClick={() => setDeletingShop(shop)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'hsl(var(--ui-danger))' }}
                  title={strings.shop.delete}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {shops.length === 0 && (
              <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
                {strings.shop.emptyHint}
              </p>
            )}
          </div>
        </div>
        {deletingShop && <DeleteConfirmation
          description={`${strings.shop.deleteConfirm}\n（${deletingShop.name} · ${deletingShop.site}）`}
          onClose={() => setDeletingShop(null)}
          onConfirm={() => handleDelete(deletingShop)}
          fallbackFocus={() => createInput.current}
        />}
      </DialogContent>
    </Dialog>
  );
};
