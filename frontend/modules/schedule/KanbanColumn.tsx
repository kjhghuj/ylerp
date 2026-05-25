import React from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { TYPE_CONFIG, type ItemType, type ScheduleItemData } from './constants';
import { ItemCard } from './ItemCard';
import { useStore } from '../../StoreContext';

interface KanbanColumnProps {
  type: ItemType;
  items: ScheduleItemData[];
  isAccordion?: boolean;
  isExpanded?: boolean;
  onAccordionToggle?: () => void;
  onCreate: (type: ItemType) => void;
  dragId: string | null;
  dragOverId: string | null;
  flyingItemId: string | null;
  progressMap: Record<string, number>;
  onToggle: (item: ScheduleItemData) => void;
  onDelete: (id: string) => void;
  onDoubleClick: (item: ScheduleItemData) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onPointerDown: (e: React.PointerEvent, item: ScheduleItemData) => void;
  onPointerUp: () => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  type, items, isAccordion, isExpanded, onAccordionToggle, onCreate,
  dragId, dragOverId, flyingItemId, progressMap,
  onToggle, onDelete, onDoubleClick,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onPointerDown, onPointerUp,
}) => {
  const { strings, language } = useStore();
  const isZh = language === 'zh';
  const config = TYPE_CONFIG[type];
  const empty = items.length === 0;

  const renderItemCard = (item: ScheduleItemData, idx: number) => (
    <ItemCard
      key={item.id}
      item={item}
      dragId={dragId}
      dragOverId={dragOverId}
      flyingItemId={flyingItemId}
      progress={progressMap[item.id] ?? 0}
      onToggle={onToggle}
      onDelete={onDelete}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    />
  );

  return (
    <div className="kanban-column rounded-xl border" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-card)' }}>
      {/* Column Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 shrink-0 ${isAccordion ? 'cursor-pointer rounded-t-xl' : 'rounded-t-xl'}`}
        style={{ borderBottom: '1px solid var(--border-light)' }}
        onClick={isAccordion ? onAccordionToggle : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${config.color} flex items-center justify-center text-white shrink-0`}>
            {React.createElement(config.icon, { size: 12 })}
          </div>
          <span className="text-xs font-bold truncate" style={{ color: 'var(--text-secondary)' }}>
            {isZh ? config.label : config.labelEn}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
            style={{ backgroundColor: 'var(--zebra-even)', color: 'var(--text-tertiary)' }}>
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onCreate(type); }}
            className="ghost-btn px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-tertiary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `rgba(${config.progressRgb}, 0.12)`;
              e.currentTarget.style.borderColor = `rgba(${config.progressRgb}, 0.4)`;
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            <Plus size={10} />
            <span className="hidden sm:inline">{isZh ? '新建' : 'New'}</span>
          </button>
          {isAccordion && (
            <ChevronDown size={14}
              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              style={{ color: 'var(--text-tertiary)' }}
            />
          )}
        </div>
      </div>

      {/* Card List */}
      <div className={`${isAccordion ? (isExpanded ? 'accordion-content open' : 'accordion-content') : ''}`}>
        <div className="kanban-column-list p-1 space-y-1">
          {items.map((item, idx) => renderItemCard(item, idx))}
          {empty && (
            <div className="flex flex-col items-center justify-center py-8 px-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center text-white opacity-25 mb-2`}>
                {React.createElement(config.icon, { size: 16 })}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {isZh ? '暂无任务' : 'No items'}
              </p>
              <button
                onClick={() => onCreate(type)}
                className="mt-2 text-[11px] font-medium ghost-btn px-3 py-1 rounded-lg"
                style={{
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `rgba(${config.progressRgb}, 0.12)`;
                  e.currentTarget.style.borderColor = `rgba(${config.progressRgb}, 0.4)`;
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
              >
                <Plus size={10} className="inline mr-0.5" />
                {isZh ? '新建' : 'New'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
