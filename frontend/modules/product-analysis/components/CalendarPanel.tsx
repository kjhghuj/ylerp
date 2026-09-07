import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, Trash2, X } from 'lucide-react';
import { useStore } from '../../../StoreContext';
import { useProductAnalysisStrings } from '../i18n';
import { todayString } from '../utils/range';
import type { DayMeta } from '../types';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const CALENDAR_ROWS = 6;

interface YearMonth {
  year: number;
  month: number; // 1-12
}

function parseYearMonth(isoDate: string): YearMonth {
  const [year, month] = isoDate.split('-').map(Number);
  return { year, month };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

interface CalendarPanelProps {
  days: DayMeta[];
  /** 无 product-analysis.upload 权限时隐藏删除入口（单个与批量） */
  canDelete: boolean;
  onDeleteDay: (date: string) => void;
  onBatchDelete: (dates: string[]) => void;
}

/** 数据日历（只读展示）：标记每天是否已上传；批量模式下点选日期批量删除 */
export const CalendarPanel: React.FC<CalendarPanelProps> = ({
  days,
  canDelete,
  onDeleteDay,
  onBatchDelete,
}) => {
  const strings = useProductAnalysisStrings();
  const { language } = useStore();
  const [view, setView] = useState<YearMonth>(() => parseYearMonth(days[0]?.date ?? todayString()));
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  const uploadedMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  // days 变化（切店/删除）后清掉已不存在的选择
  const selected = useMemo(
    () => selectedDates.filter((date) => uploadedMap.has(date)),
    [selectedDates, uploadedMap]
  );
  const today = todayString();

  const firstWeekday = (new Date(view.year, view.month - 1, 1).getDay() + 6) % 7; // 周一为 0
  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => `${view.year}-${pad2(view.month)}-${pad2(index + 1)}`
    ),
  ];
  while (cells.length < CALENDAR_ROWS * 7) cells.push(null);

  const monthTitle = new Date(view.year, view.month - 1, 1).toLocaleDateString(
    language === 'zh' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'long' }
  );

  const monthDates = cells.filter((value): value is string => value !== null);
  const allMonthSelected =
    monthDates.length > 0 && monthDates.every((date) => selected.includes(date));

  const toggleDate = (date: string) => {
    setSelectedDates((current) =>
      current.includes(date) ? current.filter((item) => item !== date) : [...current, date]
    );
  };

  const handleBatchDeleteClick = () => {
    if (selected.length === 0) return;
    const message = strings.batchDayDeleteConfirm.replace('{count}', String(selected.length));
    if (!window.confirm(message)) return;
    onBatchDelete([...selected]);
  };

  const renderToolbar = () => (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 pt-1">
      <span className="text-[11px] mr-auto" style={{ color: 'var(--text-tertiary)' }}>
        {strings.batchSelectedCount.replace('{count}', String(selected.length))}
      </span>
      <button
        type="button"
        onClick={() =>
          setSelectedDates((current) =>
            allMonthSelected ? [] : [...new Set([...current, ...monthDates])]
          )
        }
        className="px-2 py-1 rounded-lg text-[11px] border transition-colors"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        {strings.batchSelectMonth}
      </button>
      <button
        type="button"
        onClick={() => setSelectedDates([])}
        className="px-2 py-1 rounded-lg text-[11px] border transition-colors"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        {strings.batchDeselectAll}
      </button>
      <button
        type="button"
        onClick={handleBatchDeleteClick}
        disabled={selected.length === 0}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors"
        style={{
          backgroundColor: selected.length === 0 ? 'var(--bg-card)' : '#dc2626',
          borderColor: selected.length === 0 ? 'var(--border-light)' : '#dc2626',
          color: selected.length === 0 ? 'var(--text-tertiary)' : '#fff',
          cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        <Trash2 size={11} />
        {strings.batchDeleteSelected}
      </button>
      <button
        type="button"
        onClick={() => {
          setIsBatchMode(false);
          setSelectedDates([]);
        }}
        className="px-2 py-1 rounded-lg text-[11px] border transition-colors"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        {strings.batchExit}
      </button>
    </div>
  );

  return (
    <div
      className="rounded-2xl border flex flex-col h-full min-h-0"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setView((current) => shiftMonth(current, -1))}
            aria-label={strings.calendarPrevMonth}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold min-w-[5.5em] text-center" style={{ color: 'var(--text-primary)' }}>
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={() => setView((current) => shiftMonth(current, 1))}
            aria-label={strings.calendarNextMonth}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        {canDelete && !isBatchMode && (
          <button
            type="button"
            onClick={() => {
              setSelectedDates([]);
              setIsBatchMode(true);
            }}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
          >
            <ListChecks size={11} />
            {strings.batchManage}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 px-3 pt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'var(--primary)' }} />
          {strings.calendarUploaded}
        </span>
        <span>{strings.calendarMissing}</span>
      </div>

      <div className="grid grid-cols-7 px-2 py-1 text-[11px] text-center" style={{ color: 'var(--text-tertiary)' }}>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr gap-1 px-2 pb-2 flex-1 min-h-0">
        {cells.map((date, index) => {
          if (date === null) return <span key={`blank-${index}`} />;
          const day = uploadedMap.get(date);
          const isUploaded = Boolean(day);
          const isToday = date === today;
          const isFuture = date > today;
          const isSelected = selected.includes(date);

          if (isBatchMode) {
            return (
              <button
                key={date}
                type="button"
                disabled={!isUploaded}
                onClick={() => toggleDate(date)}
                aria-pressed={isSelected}
                aria-label={date}
                className="rounded-lg text-[11px] font-medium border transition-colors"
                style={{
                  backgroundColor: isSelected ? '#dc2626' : isUploaded ? 'var(--primary)' : 'transparent',
                  borderColor: isSelected ? '#dc2626' : isUploaded ? 'var(--primary)' : 'transparent',
                  color: isSelected || isUploaded ? '#fff' : 'var(--text-tertiary)',
                  opacity: isUploaded ? 1 : 0.45,
                  cursor: isUploaded ? 'pointer' : 'default',
                  boxShadow: isToday ? 'inset 0 0 0 1.5px rgba(59,130,246,0.8)' : undefined,
                }}
              >
                {Number(date.slice(8))}
              </button>
            );
          }

          return (
            <span
              key={date}
              className="group relative rounded-lg text-[11px] flex items-center justify-center border transition-colors"
              style={{
                backgroundColor: isUploaded ? 'var(--primary)' : 'transparent',
                borderColor: isUploaded ? 'var(--primary)' : 'transparent',
                color: isUploaded ? '#fff' : isFuture ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                opacity: isFuture && !isUploaded ? 0.55 : 1,
                boxShadow: isToday ? 'inset 0 0 0 1.5px rgba(59,130,246,0.8)' : undefined,
              }}
              title={day ? `${day.fileName} · ${day.itemCount}` : date}
              aria-label={date}
            >
              {Number(date.slice(8))}
              {isUploaded && canDelete && (
                <button
                  type="button"
                  onClick={() => onDeleteDay(date)}
                  className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center w-3.5 h-3.5"
                  style={{ backgroundColor: '#dc2626', color: '#fff' }}
                  aria-label={`${strings.deleteDay} ${date}`}
                >
                  <X size={9} />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {isBatchMode && renderToolbar()}
    </div>
  );
};
