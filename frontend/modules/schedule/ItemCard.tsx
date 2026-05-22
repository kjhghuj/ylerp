import React from 'react';
import { Check } from 'lucide-react';
import { TYPE_CONFIG, getDeadlineStatus, formatDate, type ScheduleItemData } from './constants';

export const DRAG_HANDLE = 'drag-handle';

interface ItemCardProps {
    item: ScheduleItemData;
    dragId: string | null;
    dragOverId: string | null;
    flyingItemId: string | null;
    progress: number;
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

export const ItemCard: React.FC<ItemCardProps> = React.memo(({
    item, dragId, dragOverId, flyingItemId, progress,
    onToggle, onDelete, onDoubleClick,
    onDragStart, onDragOver, onDrop, onDragEnd,
    onPointerDown, onPointerUp,
}) => {
    const config = TYPE_CONFIG[item.type];
    const dlStatus = getDeadlineStatus(item.deadline);
    const isUrgent = dlStatus === 'urgent';
    const isWarning = dlStatus === 'warning';
    const isDragging = dragId === item.id;
    const isDragOver = dragOverId === item.id;
    const isFlying = flyingItemId === item.id;
    const isDone = item.completed;
    const rgb = config.progressRgb;
    const showProgress = progress > 0 && !isDone;

    const urgentBorderStyle = isUrgent ? {
        borderColor: 'rgba(229,115,115,0.5)',
        animation: 'urgentGlow 2s ease-in-out infinite',
    } : {};

    const handleDragOver = !isDone ? (e: React.DragEvent) => onDragOver(e, item.id) : undefined;
    const handleDrop = !isDone ? (e: React.DragEvent) => onDrop(e, item.id) : undefined;

    return (
        <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDoubleClick={() => onDoubleClick(item)}
            onPointerDown={!isDone ? (e) => onPointerDown(e, item) : undefined}
            onPointerUp={!isDone ? onPointerUp : undefined}
            onLostPointerCapture={() => { onPointerUp(); }}
            className={`group relative rounded-xl p-3 border transition-all duration-300 select-none ${
                !isDone ? 'cursor-pointer' : ''
            } ${
                isDragging ? 'opacity-40 scale-95' : ''
            } ${
                isDragOver ? 'ring-2 ring-blue-400/50 scale-[1.02]' : ''
            } ${
                isFlying ? 'schedule-fly-out' : ''
            } ${
                isDone ? 'opacity-40' : ''
            }`}
            style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: isUrgent ? undefined : isWarning ? 'rgba(255,183,77,0.3)' : 'var(--border-default)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                touchAction: 'none',
                ...urgentBorderStyle,
            }}
        >
            <div className="flex items-start gap-2.5">
                {!isDone && (
                    <div
                        draggable
                        onDragStart={(e) => onDragStart(e, item.id)}
                        onDragEnd={onDragEnd}
                        className="drag-handle cursor-grab active:cursor-grabbing mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center"
                    >
                        <div className="flex flex-col gap-[2px]">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="flex gap-[2px]">
                                    {[0, 1].map(j => (
                                        <div key={j} className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--text-tertiary)', opacity: 0.6 }} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {isDone && (
                    <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(129,199,132,0.2)' }}>
                        <Check size={10} style={{ color: 'rgba(129,199,132,0.8)' }} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-4 h-4 rounded bg-gradient-to-br ${config.color} flex items-center justify-center text-white shrink-0`}>
                            {React.createElement(config.icon, { size: 10 })}
                        </div>
                        <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)', textDecoration: isDone ? 'line-through' : undefined }}>
                            {item.title}
                        </span>
                    </div>
                    {item.description && (
                        <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-tertiary)' }}>
                            {item.description}
                        </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                        {item.deadline && (
                            <span className={`text-[10px] font-mono ${isUrgent ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-slate-400'}`}>
                                {formatDate(item.deadline)}
                            </span>
                        )}
                        {item.type === 'notification' && item.remindAt && (
                            <span className="text-[10px] font-mono text-violet-400">
                                {'\u{1F514} '}{formatDate(item.remindAt)}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                    className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-tertiary)' }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                </button>
            </div>
            {showProgress && (
                <div className="mt-2 h-1 rounded-full overflow-hidden relative" style={{ backgroundColor: 'rgba(var(--border-light-rgb, 0,0,0), 0.1)' }}>
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            backgroundColor: `rgba(${rgb},0.6)`,
                            height: '100%',
                            width: `${progress}%`,
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute',
                                right: -5,
                                top: -5,
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: `radial-gradient(circle, rgba(${rgb},1), rgba(${rgb},0.4))`,
                                boxShadow: `0 0 10px rgba(${rgb},0.8), 0 0 20px rgba(${rgb},0.4)`,
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});
