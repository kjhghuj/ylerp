import * as React from 'react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Editable combobox for free-form model names (APG combobox 1.2, "manual"
 * selection): the input stays the real editing point and accepts any string;
 * provider suggestions are hints, never a whitelist. DOM focus never leaves
 * the input — aria-activedescendant tracks the active suggestion.
 */
export interface EditableModelComboboxProps {
  id: string;
  /** Accessible name, independent of the current value. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Deduplicated suggestion list; order is preserved. */
  suggestions: string[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Suggestion list heading announced by screen readers. */
  listLabel?: string;
}

export const EditableModelCombobox = React.forwardRef<HTMLInputElement, EditableModelComboboxProps>(
  (
    {
      id,
      label,
      value,
      onChange,
      suggestions,
      disabled = false,
      placeholder,
      className,
      listLabel = '建议模型',
    },
    forwardedRef,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const listboxId = `${id}-listbox`;
    // Tracks the anchor input so outside-interaction guards can tell anchor
    // clicks (editing intent) from genuine dismissal clicks.
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setInputElement = React.useCallback((element: HTMLInputElement | null) => {
      inputRef.current = element;
      if (typeof forwardedRef === 'function') forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    }, [forwardedRef]);

    // Deduplicate defensively; a stale active index must never select another
    // value, so it is clamped whenever the suggestion set changes.
    const items = React.useMemo(
      () => Array.from(new Set(suggestions.filter(item => item.length > 0))),
      [suggestions],
    );
    React.useEffect(() => {
      setActiveIndex(previous => (previous >= items.length ? -1 : previous));
    }, [items]);

    const close = React.useCallback(() => {
      setOpen(false);
      setActiveIndex(-1);
    }, []);

    const accept = React.useCallback(
      (item: string | undefined) => {
        if (item === undefined) {
          close();
          return;
        }
        onChange(item);
        close();
      },
      [close, onChange],
    );

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!items.length) return;
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(event.key === 'ArrowDown' ? 0 : items.length - 1);
          return;
        }
        setActiveIndex(previous => {
          if (previous === -1) return event.key === 'ArrowDown' ? 0 : items.length - 1;
          const next = event.key === 'ArrowDown' ? previous + 1 : previous - 1;
          return next < 0 || next >= items.length ? -1 : next;
        });
        return;
      }
      if (event.key === 'Enter') {
        // Never intercept IME composition commits.
        if (event.nativeEvent.isComposing) return;
        if (open && activeIndex >= 0 && items[activeIndex] !== undefined) {
          event.preventDefault();
          accept(items[activeIndex]);
          return;
        }
        if (open) {
          event.preventDefault();
          close();
        }
        return;
      }
      if (event.key === 'Escape' && open) {
        // Close suggestions only; the typed value stays exactly as entered.
        event.stopPropagation();
        close();
      }
    };

    const handleFocus = () => {
      if (items.length) setOpen(true);
    };

    // Blur to somewhere outside: close, and let focus reach the user's target.
    // Suggestion clicks never land here because their mousedown is prevented.
    const handleBlur = () => {
      if (open) close();
    };

    const activeId = open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined;

    return (
      <Popover open={open && !disabled} onOpenChange={next => { if (!next) close(); }}>
        <PopoverAnchor asChild>
          <Input
            ref={setInputElement}
            id={id}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={event => {
              onChange(event.target.value);
              if (items.length) {
                setOpen(true);
                setActiveIndex(-1);
              }
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn('w-full', className)}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          onInteractOutside={event => {
            // The popover follows focus, so the same physical click that focused
            // the input also lands outside the content. That interaction is
            // editing intent — keep the list open and let focus reach the input.
            const target = (event as unknown as { detail?: { originalEvent?: { target?: EventTarget | null } } }).detail?.originalEvent?.target;
            if (target instanceof Node && inputRef.current?.contains(target)) {
              event.preventDefault();
              return;
            }
            close();
          }}
          className="max-h-64 w-[var(--radix-popover-trigger-width)] min-w-0 overflow-y-auto p-1"
          aria-label={listLabel}
        >
          <ul id={listboxId} role="listbox" aria-label={listLabel} className="flex flex-col">
            {items.map((item, index) => (
              <li
                key={item}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // Prevent the input blur so the click still registers here.
                onMouseDown={event => event.preventDefault()}
                onClick={() => accept(item)}
                className={cn(
                  'min-w-0 cursor-pointer break-all rounded-md px-3 py-2 text-sm outline-none',
                  index === activeIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                {item}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    );
  },
);
EditableModelCombobox.displayName = 'EditableModelCombobox';
