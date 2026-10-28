/** Shared right drawer: Radix owns focus trapping, Escape, scroll lock and focus return. */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../../components/ui/sheet';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Drawer({ open, onClose, title, subtitle, width = 560, children, footer }: DrawerProps) {
  return <Sheet open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <SheetContent side="right" showCloseButton={false} aria-label={title}
      {...(!subtitle ? { 'aria-describedby': undefined } : {})}
      className="flex w-full max-w-none flex-col gap-0 border-border bg-card p-0 text-card-foreground sm:max-w-none"
      style={{ width: `min(${width}px, 94vw)` }}>
      <SheetHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-border px-4 py-3 text-left">
        <div className="min-w-0">
          <SheetTitle className="text-sm font-semibold">{title}</SheetTitle>
          {subtitle && <SheetDescription className="mt-1 text-xs">{subtitle}</SheetDescription>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭抽屉" className="h-8 w-8 shrink-0">
          <X size={16} />
        </Button>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px]">{children}</div>
      {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
    </SheetContent>
  </Sheet>;
}
