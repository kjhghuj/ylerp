import React, { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { useProductAnalysisStrings } from '../i18n';

/** Controlled confirmation keeps the selected deletion intent available after a failed request.
 * Source: https://v3.shadcn.com/docs/components/alert-dialog */
export function DeleteConfirmation({ description, onClose, onConfirm, fallbackFocus }: {
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const strings = useProductAnalysisStrings();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const confirm = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      if (await onConfirm() !== false && mounted.current) onClose();
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <AlertDialog open onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <AlertDialogContent className="max-w-[min(28rem,calc(100vw-2rem))] rounded-xl"
      onOpenAutoFocus={() => { origin.current = document.activeElement as HTMLElement | null; }}
      onCloseAutoFocus={event => {
        if (origin.current && !origin.current.isConnected) {
          const fallback = fallbackFocus?.();
          if (fallback?.isConnected) { event.preventDefault(); fallback.focus(); }
        }
      }}>
      <AlertDialogTitle>{strings.deleteDay}</AlertDialogTitle>
      <AlertDialogDescription className="whitespace-pre-line">{description}</AlertDialogDescription>
      <AlertDialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>{strings.shop.cancel}</Button>
        <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>{strings.deleteDay}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
