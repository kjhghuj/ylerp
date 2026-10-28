import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

export function ModalFrame({ title, description, onClose, busy = false, children }: React.PropsWithChildren<{ title: string; description: string; onClose: () => void; busy?: boolean }>) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent closeLabel="关闭" className="max-h-[90dvh] overflow-y-auto sm:max-w-md" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}

