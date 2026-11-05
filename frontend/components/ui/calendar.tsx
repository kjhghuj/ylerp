// First-party calendar composed from the shared UI primitives. Values are local strings.
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLocalDate, parseLocalDate } from '@/lib/localDate';
import { Button } from './button';

export interface CalendarProps {
  /** date: YYYY-MM-DD; month: YYYY-MM. */
  value: string;
  onValueChange: (value: string) => void;
  mode?: 'date' | 'month';
  disabled?: (value: string) => boolean;
  locale?: string;
  className?: string;
}

function shiftMonth(date: Date, delta: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()));
}

export function Calendar({ value, onValueChange, mode = 'date', disabled, locale = 'zh-CN', className }: CalendarProps) {
  const selectedDate = parseLocalDate(mode === 'month' ? `${value}-01` : value);
  const [view, setView] = React.useState(() => selectedDate ?? new Date());
  const [focusedValue, setFocusedValue] = React.useState(value);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const pendingFocus = React.useRef(false);
  const headingId = React.useId();
  const isChinese = locale.startsWith('zh');
  const toValue = (date: Date) => mode === 'month' ? formatLocalDate(date).slice(0, 7) : formatLocalDate(date);

  React.useEffect(() => {
    const date = parseLocalDate(mode === 'month' ? `${value}-01` : value);
    if (date) {
      setView(date);
      setFocusedValue(value);
    }
  }, [value, mode]);

  React.useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    rootRef.current?.querySelector<HTMLButtonElement>(`button[data-calendar-value="${focusedValue}"]`)?.focus();
  }, [focusedValue, view]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const columns = mode === 'month' ? 4 : 7;
  const title = mode === 'month' ? String(year) : view.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  const today = toValue(new Date());
  const cells: (string | null)[] = mode === 'month'
    ? Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
    : Array.from({ length: 42 }, (_, index) => {
      const day = index - new Date(year, month, 1).getDay() + 1;
      return day > 0 && day <= new Date(year, month + 1, 0).getDate() ? formatLocalDate(new Date(year, month, day)) : null;
    });
  const available = cells.filter((cell): cell is string => cell !== null && !disabled?.(cell));
  const tabStop = available.includes(focusedValue) ? focusedValue : available.includes(value) ? value : available[0];

  const navigate = (delta: number) => {
    const next = new Date(year, month + (mode === 'month' ? delta * 12 : delta), 1);
    if (next.getFullYear() >= 1000 && next.getFullYear() <= 9999) setView(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, cell: string) => {
    const date = parseLocalDate(mode === 'month' ? `${cell}-01` : cell)!;
    let target: Date;
    let direction = 1;
    const position = mode === 'month' ? date.getMonth() % columns : date.getDay();
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns, Home: -position, End: columns - 1 - position };
    if (event.key in steps) {
      const delta = steps[event.key];
      direction = delta < 0 ? -1 : 1;
      target = mode === 'month' ? shiftMonth(date, delta) : new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      direction = event.key === 'PageUp' ? -1 : 1;
      target = shiftMonth(date, direction * (mode === 'month' || event.shiftKey ? 12 : 1));
    } else return;
    event.preventDefault();
    // Keep keyboard navigation useful across blocked dates without unbounded searches.
    for (let attempts = 0; attempts < 366; attempts++) {
      if (target.getFullYear() < 1000 || target.getFullYear() > 9999) return;
      const next = toValue(target);
      if (!disabled?.(next)) {
        pendingFocus.current = true;
        setView(target);
        setFocusedValue(next);
        return;
      }
      target = mode === 'month' ? shiftMonth(target, direction) : new Date(target.getFullYear(), target.getMonth(), target.getDate() + direction);
    }
  };

  return (
    <div ref={rootRef} data-ui="calendar" data-mode={mode} className={cn('w-full space-y-3 text-foreground', className)}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label={isChinese ? mode === 'month' ? '上一年' : '上一月' : mode === 'month' ? 'Previous year' : 'Previous month'} disabled={year === 1000 && (mode === 'month' || month === 0)} onClick={() => navigate(-1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span id={headingId} aria-live="polite" className="text-sm font-semibold">{title}</span>
        <Button variant="outline" size="icon" aria-label={isChinese ? mode === 'month' ? '下一年' : '下一月' : mode === 'month' ? 'Next year' : 'Next month'} disabled={year === 9999 && (mode === 'month' || month === 11)} onClick={() => navigate(1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div role="grid" aria-labelledby={headingId} className="space-y-1">
        {mode === 'date' && <div role="row" className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, index) => <span key={index} role="columnheader" className="py-1 text-center text-xs text-muted-foreground">
            {new Date(2026, 10, 1 + index).toLocaleDateString(locale, { weekday: 'short' })}
          </span>)}
        </div>}
        {Array.from({ length: cells.length / columns }, (_, row) => (
          <div role="row" key={row} className={cn('grid gap-1', mode === 'month' ? 'grid-cols-4' : 'grid-cols-7')}>
            {cells.slice(row * columns, (row + 1) * columns).map((cell, index) => (
              <div role="gridcell" key={cell ?? `blank-${index}`} aria-selected={cell !== null && cell === value}>
                {cell && <Button
                  data-calendar-value={cell}
                  variant={cell === value ? 'default' : 'ghost'}
                  size="sm"
                  className={cn('h-9 w-full min-w-0 rounded-md p-0 text-sm', mode === 'month' && 'h-11', cell === today && cell !== value && 'border border-primary text-primary')}
                  aria-label={cell}
                  aria-pressed={cell === value}
                  aria-current={cell === today ? 'date' : undefined}
                  disabled={disabled?.(cell)}
                  tabIndex={cell === tabStop ? 0 : -1}
                  onFocus={() => setFocusedValue(cell)}
                  onKeyDown={event => handleKeyDown(event, cell)}
                  onClick={() => onValueChange(cell)}
                >
                  {mode === 'month' ? new Date(year, Number(cell.slice(5, 7)) - 1, 1).toLocaleDateString(locale, { month: 'short' }) : Number(cell.slice(8))}
                </Button>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
