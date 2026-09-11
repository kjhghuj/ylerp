/**
 * 通用右侧抽屉：Esc 关闭、打开时一次性初始聚焦、焦点圈定（Tab 循环不出面板）、
 * 关闭后焦点返回触发元素。focus 效果只依赖 open，父组件每次传入新的内联 onClose
 * 不会触发清理与重新聚焦（修复输入时焦点被抢走的问题）。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Drawer({ open, onClose, title, subtitle, width = 560, children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // onClose 存 ref：效果不依赖它，父组件重渲染不会重新运行清理逻辑
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // 仅在打开时做一次初始聚焦（rAF 等面板挂载完成）
    const frame = requestAnimationFrame(() => panelRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // 焦点圈定：Tab / Shift+Tab 循环限制在面板内
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(element => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      // 关闭后焦点返回触发元素
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 flex flex-col shadow-lg outline-none"
        style={{
          width: `min(${width}px, 94vw)`,
          backgroundColor: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-light)',
        }}
      >
        <div
          className="flex items-start justify-between gap-3 px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border-light)' }}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            {subtitle && (
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="关闭抽屉"
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ fontSize: 13 }}>
          {children}
        </div>
        {footer && (
          <div
            className="px-4 py-3 shrink-0 flex items-center justify-end gap-2"
            style={{ borderTop: '1px solid var(--border-light)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
