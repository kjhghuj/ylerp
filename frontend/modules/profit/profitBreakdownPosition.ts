interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface SizeLike {
  width: number;
  height: number;
}

export interface ProfitPopoverPosition {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
}

export const PROFIT_POPOVER_VIEWPORT_MARGIN = 12;
export const PROFIT_POPOVER_GAP = 8;

export const calculateProfitPopoverPosition = (
  trigger: RectLike,
  popover: SizeLike,
  viewport: SizeLike,
): ProfitPopoverPosition => {
  const maxLeft = Math.max(
    PROFIT_POPOVER_VIEWPORT_MARGIN,
    viewport.width - popover.width - PROFIT_POPOVER_VIEWPORT_MARGIN,
  );
  const centeredLeft = trigger.left + (trigger.width / 2) - (popover.width / 2);
  const left = Math.min(maxLeft, Math.max(PROFIT_POPOVER_VIEWPORT_MARGIN, centeredLeft));
  const preferredTop = trigger.top - popover.height - PROFIT_POPOVER_GAP;
  const placement = preferredTop >= PROFIT_POPOVER_VIEWPORT_MARGIN ? 'top' : 'bottom';
  const rawTop = placement === 'top' ? preferredTop : trigger.bottom + PROFIT_POPOVER_GAP;
  const maxTop = Math.max(
    PROFIT_POPOVER_VIEWPORT_MARGIN,
    viewport.height - popover.height - PROFIT_POPOVER_VIEWPORT_MARGIN,
  );
  const top = Math.min(maxTop, Math.max(PROFIT_POPOVER_VIEWPORT_MARGIN, rawTop));
  const triggerCenter = trigger.left + (trigger.width / 2);
  const arrowLeft = Math.min(popover.width - 16, Math.max(16, triggerCenter - left));

  return { top, left, arrowLeft, placement };
};
