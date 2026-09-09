import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { RankedRestockTargetSku } from "../utils/restockTargetSku";

/** 补货V2 / V3 共用：SKU 忽略大小写与首尾空格的相等比较 */
export const sameSku = (
  left: string | null | undefined,
  right: string | null | undefined,
) =>
  String(left || "")
    .trim()
    .toUpperCase() ===
  String(right || "")
    .trim()
    .toUpperCase();

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const percentageStyle = (percentage: number) =>
  percentage === 100
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : percentage >= 80
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";

interface CandidatePickerProps {
  itemId: string;
  candidates: RankedRestockTargetSku[];
  selectedSku: string;
  selectedCandidate?: RankedRestockTargetSku;
  onChange: (sku: string) => void;
}

type CandidateMenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
  top?: number;
  bottom?: number;
};

const candidateOptionId = (itemId: string, candidateId: string) =>
  `target-sku-option-${itemId}-${candidateId}`.replace(/[^A-Za-z0-9_-]/g, "-");

/** 补货V2 / V3 共用：本地 SKU 候选下拉（键盘可访问，portal 定位到 body） */
export const CandidatePicker: React.FC<CandidatePickerProps> = ({
  itemId,
  candidates,
  selectedSku,
  selectedCandidate,
  onChange,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const enterFrameRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<CandidateMenuPosition>({
    left: 8,
    width: 208,
    maxHeight: 256,
    placement: "bottom",
    top: 0,
  });

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 4;
    const width = Math.min(
      Math.max(rect.width, 208),
      Math.max(208, viewportWidth - 16),
    );
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const belowSpace = viewportHeight - rect.bottom - gap - 8;
    const aboveSpace = rect.top - gap - 8;
    const placement =
      belowSpace < 180 && aboveSpace > belowSpace ? "top" : "bottom";
    const availableSpace = placement === "top" ? aboveSpace : belowSpace;
    const maxHeight = Math.max(96, Math.min(256, availableSpace));
    setMenuPosition(
      placement === "top"
        ? {
            left,
            width,
            maxHeight,
            placement,
            bottom: viewportHeight - rect.top + gap,
          }
        : { left, width, maxHeight, placement, top: rect.bottom + gap },
    );
  }, []);

  const closeMenu = useCallback(() => {
    if (enterFrameRef.current !== null)
      window.cancelAnimationFrame(enterFrameRef.current);
    if (exitTimerRef.current !== null)
      window.clearTimeout(exitTimerRef.current);
    setExpanded(false);
    setMenuVisible(false);
    if (prefersReducedMotion()) {
      setMenuMounted(false);
      return;
    }
    exitTimerRef.current = window.setTimeout(() => {
      setMenuMounted(false);
      exitTimerRef.current = null;
    }, 160);
  }, []);

  const openMenu = useCallback(() => {
    if (exitTimerRef.current !== null)
      window.clearTimeout(exitTimerRef.current);
    if (enterFrameRef.current !== null)
      window.cancelAnimationFrame(enterFrameRef.current);
    updateMenuPosition();
    setExpanded(true);
    setMenuMounted(true);
    setMenuVisible(false);
    enterFrameRef.current = window.requestAnimationFrame(() => {
      setMenuVisible(true);
      enterFrameRef.current = null;
    });
  }, [updateMenuPosition]);

  useEffect(() => {
    const close = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        closeMenu();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [closeMenu]);

  useEffect(() => {
    if (!menuMounted) return undefined;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuMounted, updateMenuPosition]);

  useEffect(
    () => () => {
      if (enterFrameRef.current !== null)
        window.cancelAnimationFrame(enterFrameRef.current);
      if (exitTimerRef.current !== null)
        window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const index = candidates.findIndex((candidate) =>
      sameSku(candidate.sku, selectedSku),
    );
    setActiveIndex(index >= 0 ? index : 0);
  }, [candidates, selectedSku]);

  useEffect(() => {
    if (!expanded || !menuMounted) return;
    const active = candidates[activeIndex];
    if (!active) return;
    const option = document.getElementById(
      candidateOptionId(itemId, active.id),
    );
    if (option && typeof option.scrollIntoView === "function")
      option.scrollIntoView({ block: "nearest" });
  }, [activeIndex, candidates, expanded, itemId, menuMounted]);

  const select = (candidate?: RankedRestockTargetSku) => {
    if (candidate) onChange(candidate.sku);
    closeMenu();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) {
        openMenu();
        return;
      }
      if (!candidates.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (previous) =>
          (previous + direction + candidates.length) % candidates.length,
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) select(candidates[activeIndex]);
      else openMenu();
    }
  };

  const activeCandidate = expanded ? candidates[activeIndex] : undefined;
  const activeDescendant = activeCandidate
    ? candidateOptionId(itemId, activeCandidate.id)
    : undefined;
  const menu = menuMounted
    ? createPortal(
        <div
          ref={menuRef}
          id={`target-sku-options-${itemId}`}
          role="listbox"
          aria-label="本地 SKU 候选"
          data-state={menuVisible ? "open" : expanded ? "entering" : "exiting"}
          data-placement={menuPosition.placement}
          style={{
            position: "fixed",
            zIndex: 100,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            top: menuPosition.top,
            bottom: menuPosition.bottom,
          }}
          className={`overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl transition-[opacity,transform] duration-[160ms] motion-reduce:transition-none motion-reduce:transform-none ${
            menuVisible
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : `pointer-events-none scale-[.98] opacity-0 ${menuPosition.placement === "top" ? "translate-y-1" : "-translate-y-1"}`
          }`}
        >
          {candidates.length ? (
            candidates.map((candidate, index) => (
              <button
                id={candidateOptionId(itemId, candidate.id)}
                key={candidate.id}
                type="button"
                role="option"
                aria-selected={sameSku(candidate.sku, selectedSku)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(candidate)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <span className="font-medium">{candidate.sku}</span>
                {candidate.matchPercentage !== undefined ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ring-1 ${percentageStyle(candidate.matchPercentage)}`}
                  >
                    {candidate.matchPercentage}%
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">没有符合的 SKU</p>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="relative min-w-[13rem]">
      <button
        ref={triggerRef}
        type="button"
        data-testid={`target-sku-select-${itemId}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={`target-sku-options-${itemId}`}
        aria-activedescendant={activeDescendant}
        onClick={() => (expanded ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm transition duration-[160ms] hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {selectedCandidate?.sku || "选择本地 SKU"}
          </span>
          {selectedCandidate?.matchPercentage !== undefined ? (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ring-1 ${percentageStyle(selectedCandidate.matchPercentage)}`}
            >
              {selectedCandidate.matchPercentage}%
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-500 transition-transform duration-[160ms] motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </div>
  );
};
