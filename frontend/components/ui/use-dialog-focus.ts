import * as React from 'react';

type AutoFocusHandler = (event: Event) => void;

/** Radix's modal Dialog normally returns focus to DialogTrigger. Controlled
 * business dialogs can open without a Trigger, so remember the actual opener
 * at each open-autofocus event, before Radix or the caller moves focus.
 * API: https://www.radix-ui.com/primitives/docs/components/dialog#content
 */
export function useDialogFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: { onOpenAutoFocus?: AutoFocusHandler; onCloseAutoFocus?: AutoFocusHandler }) {
  const opener = React.useRef<HTMLElement | null>(null);
  const handleOpenAutoFocus = React.useCallback((event: Event) => {
    const ownerDocument = event.target instanceof Element ? event.target.ownerDocument : document;
    const active = ownerDocument.activeElement;
    opener.current = active instanceof HTMLElement && active !== ownerDocument.body && active !== ownerDocument.documentElement
      ? active : null;
    onOpenAutoFocus?.(event);
  }, [onOpenAutoFocus]);

  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    onCloseAutoFocus?.(event);
    const destination = opener.current;
    if (event.defaultPrevented || !destination?.isConnected) return;
    // Let Radix restore a registered Trigger or honor a non-modal outside click
    // first. Only repair the missing-Trigger case if focus ends up on the page.
    queueMicrotask(() => {
      const ownerDocument = destination.ownerDocument;
      const active = ownerDocument.activeElement;
      if (destination.isConnected && (!active || active === ownerDocument.body || active === ownerDocument.documentElement)) {
        destination.focus({ preventScroll: true });
      }
    });
  }, [onCloseAutoFocus]);

  return { onOpenAutoFocus: handleOpenAutoFocus, onCloseAutoFocus: handleCloseAutoFocus };
}
