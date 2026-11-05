import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '../lib/utils';
import { parseLocalDate } from '../lib/localDate';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface DatePickerProps {
  value: string;
  onValueChange: (value: string) => void;
  'aria-label': string;
  id?: string;
  className?: string;
  disabled?: boolean;
  locale?: string;
}

export function DatePicker({ value, onValueChange, 'aria-label': label, id, className, disabled, locale = 'zh-CN' }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const valueId = React.useId();
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" disabled={disabled} aria-label={label} aria-describedby={valueId} data-date-picker="" className={cn('justify-between gap-3 font-normal', className)}>
          <span id={valueId}>{parseLocalDate(value) ? value : locale.startsWith('zh') ? '选择日期' : 'Select date'}</span>
          <CalendarDays aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent ref={contentRef} align="start" aria-label={label} className="w-80 max-w-[calc(100vw-2rem)] p-3" onOpenAutoFocus={event => {
        event.preventDefault();
        contentRef.current?.querySelector<HTMLButtonElement>('button[data-calendar-value][tabindex="0"]')?.focus();
      }}>
        <Calendar value={value} locale={locale} onValueChange={date => { onValueChange(date); setOpen(false); }} />
      </PopoverContent>
    </Popover>
  );
}
