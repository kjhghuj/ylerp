import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import api from '../src/api';
import {
    Plus, Check, Trash2, Clock, Lightbulb, Store, Bell,
    Archive, X, Sparkles, FileText, Edit3, GripVertical, Save, Search, CalendarDays
} from 'lucide-react';

type ItemType = 'routine' | 'approval' | 'idea' | 'shop-event' | 'notification';

interface ScheduleItemData {
    id: string;
    type: ItemType;
    title: string;
    description?: string;
    deadline?: string;
    remindAt?: string;
    completed: boolean;
    completedAt?: string;
    notes?: string;
    feedback?: string;
    sortKey: number;
    createdAt: string;
    updatedAt: string;
}

const TYPE_CONFIG: Record<ItemType, { icon: any; color: string; label: string; labelEn: string; progressRgb: string }> = {
    routine: { icon: Check, color: 'from-emerald-400 to-teal-500', label: '每日任务', labelEn: 'Routine', progressRgb: '129,199,132' },
    approval: { icon: Clock, color: 'from-blue-400 to-indigo-500', label: '审批', labelEn: 'Approval', progressRgb: '100,181,246' },
    idea: { icon: Lightbulb, color: 'from-amber-400 to-orange-500', label: '想法测试', labelEn: 'Idea', progressRgb: '255,183,77' },
    'shop-event': { icon: Store, color: 'from-purple-400 to-violet-500', label: '店铺活动', labelEn: 'Shop Event', progressRgb: '179,136,255' },
    notification: { icon: Bell, color: 'from-red-400 to-rose-500', label: '提醒', labelEn: 'Notification', progressRgb: '244,114,182' },
};

const getDeadlineStatus = (deadline?: string): 'safe' | 'warning' | 'urgent' | 'none' => {
    if (!deadline) return 'none';
    const now = Date.now();
    const dl = new Date(deadline).getTime();
    const diff = dl - now;
    if (diff < 0) return 'urgent';
    if (diff < 24 * 60 * 60 * 1000) return 'urgent';
    if (diff < 48 * 60 * 60 * 1000) return 'warning';
    return 'safe';
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，注意休息';
    if (h < 12) return '早安，今日事今日毕';
    if (h < 18) return '午后好，继续加油';
    return '晚安，别忘了复盘';
};

interface ItemCardProps {
    item: ScheduleItemData;
    isZh: boolean;
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

const DRAG_HANDLE = 'drag-handle';

const ItemCard: React.FC<ItemCardProps> = React.memo(({
    item, dragId, dragOverId, flyingItemId, progress,
    onToggle, onDelete, onDoubleClick,
    onDragStart, onDragOver, onDrop, onDragEnd,
    onPointerDown, onPointerUp,
}) => {
    const config = TYPE_CONFIG[item.type];
    const dlStatus = getDeadlineStatus(item.deadline);
    const isUrgent = dlStatus === 'urgent';
    const isWarning = dlStatus === 'warning';
    const isSafe = dlStatus === 'safe';
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

    return (
        <div
            onDragOver={!isDone ? (e) => onDragOver(e, item.id) : undefined}
            onDrop={!isDone ? (e) => onDrop(e, item.id) : undefined}
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
                        className={`mt-0.5 shrink-0 cursor-grab active:cursor-grabbing rounded p-0.5 ${DRAG_HANDLE}`}
                        style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <GripVertical size={14} />
                    </div>
                )}
                <button
                    onClick={() => onToggle(item)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-300"
                    style={{
                        borderColor: isDone ? '#F2C94C' : 'var(--border-default)',
                        backgroundColor: isDone ? '#F2C94C' : 'transparent',
                    }}
                >
                    {isDone && <Check size={12} strokeWidth={3} style={{ color: '#2F3437' }} />}
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        {isUrgent && !isDone && (
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#E57373' }} />
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#E57373' }} />
                            </span>
                        )}
                        {isWarning && !isUrgent && !isDone && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#FFB74D' }} />
                        )}
                        {isSafe && !isDone && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#81C784' }} />
                        )}
                        <p className={`text-sm font-bold truncate ${isDone ? 'line-through' : ''}`} style={{ color: isDone ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                            {item.title}
                        </p>
                    </div>
                    {item.description && (
                        <p className={`text-xs mb-1 line-clamp-2 ${isDone ? 'line-through' : ''}`} style={{ color: 'var(--text-tertiary)' }}>{item.description}</p>
                    )}
                    {item.deadline && !isDone && (
                        <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: isUrgent ? '#E57373' : isWarning ? '#FFB74D' : 'var(--text-tertiary)' }}>
                            <Clock size={10} />
                            <span>{formatDate(item.deadline)}</span>
                        </div>
                    )}
                    {item.remindAt && !isDone && (
                        <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            <Bell size={10} />
                            <span>{formatDate(item.remindAt)}</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => onDelete(item.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-tertiary)' }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
            {showProgress && (
                <div className="absolute bottom-0 left-0 right-0 rounded-b-xl overflow-hidden" style={{ height: '4px' }}>
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            height: '100%',
                            width: `${progress}%`,
                            borderRadius: '0 4px 0 12px',
                            background: `linear-gradient(90deg, rgba(${rgb},0.2), rgba(${rgb},0.95))`,
                            boxShadow: `0 0 12px rgba(${rgb},0.6), 0 0 24px rgba(${rgb},0.25)`,
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
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

export const ScheduleManager: React.FC = () => {
    const { strings, language } = useStore();
    const { user } = useAuth();
    const isZh = language === 'zh';

    const [items, setItems] = useState<ScheduleItemData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState<ItemType | null>(null);
    const [showArchive, setShowArchive] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newDeadline, setNewDeadline] = useState('');
    const [newRemindAt, setNewRemindAt] = useState('');
    const [editingItem, setEditingItem] = useState<ScheduleItemData | null>(null);
    const [editNotes, setEditNotes] = useState('');
    const [editFeedback, setEditFeedback] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editDeadline, setEditDeadline] = useState('');
    const [editRemindAt, setEditRemindAt] = useState('');
    const [showEditModal, setShowEditModal] = useState(false);
    const [archiveSearch, setArchiveSearch] = useState('');
    const [archiveDateFilter, setArchiveDateFilter] = useState('');
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [flyingItemId, setFlyingItemId] = useState<string | null>(null);
    const [pressingId, setPressingId] = useState<string | null>(null);
    const [progressMap, setProgressMap] = useState<Record<string, number>>({});
    const progressMapRef = useRef<Record<string, number>>({});
    const pressStartRef = useRef<Record<string, number>>({});
    const freezeMapRef = useRef<Record<string, number>>({});
    const rafRef = useRef<number>(0);
    const pressingIdRef = useRef<string | null>(null);
    const itemsRef = useRef<ScheduleItemData[]>([]);
    const onLongPressCompleteRef = useRef<(item: ScheduleItemData) => void>(() => {});

    const handlePointerDown = useCallback((e: React.PointerEvent, item: ScheduleItemData) => {
        const target = e.target as HTMLElement;
        if (target.closest('.drag-handle')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pressingIdRef.current = item.id;
        setPressingId(item.id);
        const freeze = freezeMapRef.current[item.id] ?? 0;
        pressStartRef.current[item.id] = performance.now() - (freeze / 100) * 1000;
        if (progressMapRef.current[item.id] === undefined) {
            progressMapRef.current = { ...progressMapRef.current, [item.id]: freeze };
            setProgressMap(progressMapRef.current);
        }
    }, []);

    const handlePointerUp = useCallback(() => {
        const id = pressingIdRef.current;
        if (id) {
            freezeMapRef.current[id] = progressMapRef.current[id] ?? 0;
        }
        pressingIdRef.current = null;
        setPressingId(null);
    }, []);

    useEffect(() => {
        let alive = true;
        const tick = (now: number) => {
            if (!alive) return;

            const next = { ...progressMapRef.current };
            let changed = false;
            const pressing = pressingIdRef.current;

            if (pressing) {
                const start = pressStartRef.current[pressing] ?? now;
                const nv = Math.min(100, ((now - start) / 1000) * 100);
                if (nv >= 100) {
                    next[pressing] = 100;
                    progressMapRef.current = next;
                    setProgressMap(next);
                    pressingIdRef.current = null;
                    setPressingId(null);
                    freezeMapRef.current[pressing] = 0;
                    delete pressStartRef.current[pressing];
                    const item = itemsRef.current.find(i => i.id === pressing);
                    if (item) {
                        setTimeout(() => {
                            next[pressing] = 0;
                            progressMapRef.current = { ...progressMapRef.current, [pressing]: 0 };
                            setProgressMap({ ...progressMapRef.current });
                            onLongPressCompleteRef.current(item);
                        }, 0);
                    }
                } else {
                    next[pressing] = nv;
                    progressMapRef.current = next;
                    setProgressMap(next);
                }
                changed = true;
            }

            for (const id of Object.keys(next)) {
                if (id === pressing) continue;
                const val = next[id];
                if (val > 0) {
                    next[id] = Math.max(0, val - 0.5);
                    if (next[id] === 0) {
                        delete freezeMapRef.current[id];
                        delete pressStartRef.current[id];
                    }
                    changed = true;
                }
            }
            if (changed && !pressing) {
                progressMapRef.current = next;
                setProgressMap(next);
            }

            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            alive = false;
            cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const today = new Date();
    const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const todayWeekDay = weekDays[today.getDay()];

    const fetchItems = useCallback(async () => {
        try {
            const res = await api.get('/schedule');
            setItems(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error('Failed to fetch schedule items', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    // Browser notification for due items
    useEffect(() => {
        if (!('Notification' in window) || Notification.permission === 'denied') return;
        if (Notification.permission === 'default') Notification.requestPermission();
        const now = Date.now();
        const dueItems = items.filter(i => {
            if (i.completed) return false;
            if (i.remindAt && new Date(i.remindAt).getTime() <= now) return true;
            if (i.deadline && new Date(i.deadline).getTime() - now < 3600000) return true;
            return false;
        });
        if (dueItems.length > 0 && Notification.permission === 'granted') {
            dueItems.forEach(i => {
                const config = TYPE_CONFIG[i.type];
                new Notification(i.title, {
                    body: i.deadline ? `${isZh ? '截止' : 'Due'}: ${formatDate(i.deadline)}` : (isZh ? '提醒时间已到' : 'Reminder time reached'),
                    icon: '/favicon.png',
                    tag: `schedule-${i.id}`,
                });
            });
        }
    }, [items]);

    useEffect(() => {
        const lastReset = localStorage.getItem('yl-schedule-last-reset');
        const todayKey = formatDateShort(new Date().toISOString());
        if (lastReset !== todayKey) {
            api.post('/schedule/reset-daily').then((res) => {
                if (res.data?.reset > 0) {
                    localStorage.setItem('yl-schedule-last-reset', todayKey);
                    fetchItems();
                } else {
                    localStorage.setItem('yl-schedule-last-reset', todayKey);
                }
            }).catch(() => {
                localStorage.setItem('yl-schedule-last-reset', todayKey);
            });
        }
    }, [fetchItems]);

    const handleCreate = async () => {
        if (!showCreate || !newTitle.trim()) return;
        try {
            const sameType = items.filter(i => i.type === showCreate && !i.completed);
            const maxSortKey = sameType.length > 0 ? Math.max(...sameType.map(i => i.sortKey)) : 0;
            const res = await api.post('/schedule', {
                type: showCreate,
                title: newTitle.trim(),
                description: newDesc.trim() || null,
                deadline: newDeadline || null,
                remindAt: newRemindAt || null,
                sortKey: maxSortKey + 1,
            });
            setItems(prev => [res.data, ...prev]);
            setNewTitle('');
            setNewDesc('');
            setNewDeadline('');
            setNewRemindAt('');
            setShowCreate(null);
        } catch (e) {
            console.error('Failed to create item', e);
        }
    };

    const handleToggle = useCallback(async (item: ScheduleItemData) => {
        if (item.completed) {
            try {
                const res = await api.put(`/schedule/${item.id}`, { completed: false });
                setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
            } catch (e) {
                console.error('Failed to uncomplete item', e);
            }
            return;
        }
        if (item.type === 'idea') {
            setEditingItem(item);
            setEditNotes(item.notes || '');
            setEditFeedback(item.feedback || '');
            return;
        }
        setFlyingItemId(item.id);
        setTimeout(async () => {
            try {
                const res = await api.put(`/schedule/${item.id}`, { completed: true });
                setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
            } catch (e) {
                console.error('Failed to complete item', e);
            }
            setFlyingItemId(null);
        }, 600);
    }, []);

    itemsRef.current = items;
    onLongPressCompleteRef.current = handleToggle;

    const handleArchiveWithNotes = async () => {
        if (!editingItem) return;
        const itemRef = editingItem;
        setFlyingItemId(itemRef.id);
        setTimeout(async () => {
            try {
                const res = await api.put(`/schedule/${itemRef.id}`, {
                    completed: true,
                    notes: editNotes,
                    feedback: editFeedback,
                });
                setItems(prev => prev.map(i => i.id === itemRef.id ? res.data : i));
            } catch (e) {
                console.error('Failed to archive idea', e);
            }
            setFlyingItemId(null);
            setEditingItem(null);
            setEditNotes('');
            setEditFeedback('');
        }, 600);
    };

    const handleDelete = useCallback(async (id: string) => {
        try {
            await api.delete(`/schedule/${id}`);
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (e) {
            console.error('Failed to delete item', e);
        }
    }, []);

    const handleDoubleClick = useCallback((item: ScheduleItemData) => {
        if (item.completed) return;
        setEditTitle(item.title);
        setEditDesc(item.description || '');
        setEditDeadline(item.deadline ? item.deadline.slice(0, 16) : '');
        setEditRemindAt(item.remindAt ? item.remindAt.slice(0, 16) : '');
        setEditingItem(item);
        setShowEditModal(true);
    }, []);

    const handleSaveEdit = async () => {
        if (!editingItem) return;
        try {
            const res = await api.put(`/schedule/${editingItem.id}`, {
                title: editTitle.trim(),
                description: editDesc.trim() || null,
                deadline: editDeadline || null,
                remindAt: editRemindAt || null,
            });
            setItems(prev => prev.map(i => i.id === editingItem.id ? res.data : i));
            setShowEditModal(false);
            setEditingItem(null);
        } catch (e) {
            console.error('Failed to update item', e);
        }
    };

    const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        requestAnimationFrame(() => setDragId(id));
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragId && id !== dragId) {
            setDragOverId(id);
        }
    }, [dragId]);

    const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!dragId || dragId === targetId) {
            setDragId(null);
            setDragOverId(null);
            return;
        }
        const draggedItem = items.find(i => i.id === dragId);
        const targetItem = items.find(i => i.id === targetId);
        if (!draggedItem || !targetItem || draggedItem.type !== targetItem.type) {
            setDragId(null);
            setDragOverId(null);
            return;
        }
        const sameTypeItems = items
            .filter(i => i.type === draggedItem.type && !i.completed)
            .sort((a, b) => a.sortKey - b.sortKey);
        const withoutDragged = sameTypeItems.filter(i => i.id !== dragId);
        const targetIdx = withoutDragged.findIndex(i => i.id === targetId);
        withoutDragged.splice(targetIdx, 0, draggedItem);
        const reordered = withoutDragged.map((item, idx) => ({ ...item, sortKey: idx }));
        const newItems = items.map(item => {
            const reorderedItem = reordered.find(r => r.id === item.id);
            return reorderedItem || item;
        });
        setItems(newItems);
        try {
            await api.post('/schedule/reorder', {
                orders: reordered.map(({ id, sortKey }) => ({ id, sortKey })),
            });
        } catch (e) {
            console.error('Failed to save reorder', e);
            fetchItems();
        }
        setDragId(null);
        setDragOverId(null);
    }, [dragId, items, fetchItems]);

    const handleDragEnd = useCallback(() => {
        setDragId(null);
        setDragOverId(null);
    }, []);

    const activeItems = items.filter(i => !i.completed);
    const archivedItems = items.filter(i => i.completed && i.completedAt && i.type !== 'routine');

    const filteredArchived = archivedItems.filter(item => {
        if (archiveSearch) {
            const q = archiveSearch.toLowerCase();
            if (!item.title.toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) return false;
        }
        if (archiveDateFilter) {
            const completedDate = item.completedAt ? item.completedAt.slice(0, 10) : '';
            if (completedDate !== archiveDateFilter) return false;
        }
        return true;
    });

    const archivedByDate = filteredArchived.reduce<Record<string, ScheduleItemData[]>>((acc, item) => {
        const dateKey = item.completedAt ? item.completedAt.slice(0, 10) : 'unknown';
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(item);
        return acc;
    }, {});

    const routinesActive = activeItems.filter(i => i.type === 'routine').sort((a, b) => a.sortKey - b.sortKey);
    const routinesDone = items.filter(i => i.type === 'routine' && i.completed).sort((a, b) => {
        if (a.completedAt && b.completedAt) return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        return 0;
    });
    const routines = [...routinesActive, ...routinesDone];

    const schedules = activeItems.filter(i => i.type === 'schedule').sort((a, b) => a.sortKey - b.sortKey);
    const shopEvents = activeItems.filter(i => i.type === 'shop-event').sort((a, b) => a.sortKey - b.sortKey);
    const ideas = activeItems.filter(i => i.type === 'idea').sort((a, b) => a.sortKey - b.sortKey);

    const CreateModal = showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setShowCreate(null)}>
            <div className="w-full max-w-md rounded-2xl p-6 border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${TYPE_CONFIG[showCreate].color} flex items-center justify-center text-white`}>
                            {React.createElement(TYPE_CONFIG[showCreate].icon, { size: 16 })}
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {isZh ? TYPE_CONFIG[showCreate].label : TYPE_CONFIG[showCreate].labelEn}
                        </span>
                    </div>
                    <button onClick={() => setShowCreate(null)} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-3">
                    <input type="text" placeholder={isZh ? '标题' : 'Title'} value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border text-sm font-medium outline-none transition-colors"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                        autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} />
                    <textarea placeholder={isZh ? '描述（可选）' : 'Description (optional)'} value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                        className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none transition-colors"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                    {(showCreate === 'approval' || showCreate === 'shop-event' || showCreate === 'notification') && (
                        <input type="datetime-local" value={newDeadline} onChange={e => setNewDeadline(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                    )}
                    {showCreate === 'notification' && (
                        <input type="datetime-local" value={newRemindAt} onChange={e => setNewRemindAt(e.target.value)}
                            placeholder={isZh ? '提醒时间 (可选)' : 'Reminder time (optional)'}
                            className="w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                    )}
                    <button onClick={handleCreate} disabled={!newTitle.trim()}
                        className="w-full h-10 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-40 transition-all">
                        {isZh ? '创建' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const EditModal = showEditModal && editingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => { setShowEditModal(false); setEditingItem(null); }}>
            <div className="w-full max-w-md rounded-2xl p-6 border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Edit3 size={16} style={{ color: 'var(--text-secondary)' }} />
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {isZh ? '编辑' : 'Edit'} - {isZh ? TYPE_CONFIG[editingItem.type].label : TYPE_CONFIG[editingItem.type].labelEn}
                        </span>
                    </div>
                    <button onClick={() => { setShowEditModal(false); setEditingItem(null); }} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '标题' : 'Title'}</label>
                        <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border text-sm font-medium outline-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} />
                    </div>
                    <div>
                        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '描述' : 'Description'}</label>
                        <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                    </div>
                    {(editingItem.type === 'approval' || editingItem.type === 'shop-event' || editingItem.type === 'notification') && (
                        <div>
                            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '截止时间' : 'Deadline'}</label>
                            <input type="datetime-local" value={editDeadline} onChange={e => setEditDeadline(e.target.value)}
                                className="w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors"
                                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                        </div>
                    )}
                    {editingItem.type === 'notification' && (
                        <div>
                            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '提醒时间' : 'Reminder'}</label>
                            <input type="datetime-local" value={editRemindAt} onChange={e => setEditRemindAt(e.target.value)}
                                className="w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors"
                                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button onClick={() => { setShowEditModal(false); setEditingItem(null); }}
                            className="flex-1 h-10 rounded-lg text-sm font-bold border transition-all"
                            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                            {isZh ? '取消' : 'Cancel'}
                        </button>
                        <button onClick={handleSaveEdit} disabled={!editTitle.trim()}
                            className="flex-1 h-10 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5">
                            <Save size={14} />
                            {isZh ? '保存' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    const IdeaCompleteModal = editingItem && !showEditModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-lg rounded-2xl p-6 border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Sparkles size={18} style={{ color: '#F2C94C' }} />
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '归档想法' : 'Archive Idea'}</span>
                    </div>
                    <button onClick={() => setEditingItem(null)} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                        <X size={18} />
                    </button>
                </div>
                <div className="mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{editingItem.title}</p>
                    {editingItem.description && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{editingItem.description}</p>}
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '执行备注' : 'Notes'}</label>
                        <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            placeholder={isZh ? '记录执行过程...' : 'Execution notes...'} />
                    </div>
                    <div>
                        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '后期反馈' : 'Feedback'}</label>
                        <textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} rows={3}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            placeholder={isZh ? '记录后期效果...' : 'Results & feedback...'} />
                    </div>
                    <button onClick={handleArchiveWithNotes}
                        className="w-full h-10 rounded-lg text-sm font-bold transition-all"
                        style={{ backgroundColor: '#F2C94C', color: '#2F3437' }}>
                        {isZh ? '归档' : 'Archive'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const itemCardProps = useMemo(() => ({
        isZh,
        dragId,
        dragOverId,
        flyingItemId,
        onToggle: handleToggle,
        onDelete: handleDelete,
        onDoubleClick: handleDoubleClick,
        onDragStart: handleDragStart,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
        onDragEnd: handleDragEnd,
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
    }), [isZh, dragId, dragOverId, flyingItemId, handleToggle, handleDelete, handleDoubleClick, handleDragStart, handleDragOver, handleDrop, handleDragEnd, handlePointerDown, handlePointerUp]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <style>{`
                @keyframes urgentGlow {
                    0%, 100% { box-shadow: 0 0 8px rgba(229,115,115,0.1), 0 4px 20px rgba(0,0,0,0.02); }
                    50% { box-shadow: 0 0 16px rgba(229,115,115,0.25), 0 4px 20px rgba(0,0,0,0.02); }
                }
                .schedule-fly-out {
                    animation: flyToArchive 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }
                @keyframes flyToArchive {
                    0% { transform: scale(1); opacity: 1; }
                    30% { transform: scale(0.6); opacity: 0.8; }
                    100% { transform: scale(0.1) translate(calc(100vw - 80px), calc(100vh - 80px)); opacity: 0; }
                }
            `}</style>
            <div className="flex items-center justify-between px-1 mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                        {todayStr} {isZh ? `星期${todayWeekDay}` : ''}
                    </h2>
                    <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{getGreeting()}</p>
                </div>
                <div className="flex items-center gap-1.5">
                    {(['routine', 'schedule', 'idea'] as ItemType[]).map(type => (
                        <button key={type} onClick={() => setShowCreate(type)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-card)' }}>
                            <Plus size={12} />
                            {isZh ? TYPE_CONFIG[type].label : TYPE_CONFIG[type].labelEn}
                        </button>
                    ))}
                    <button onClick={() => setShowCreate('shop-event')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-card)' }}>
                        <Plus size={12} />
                        {isZh ? '店铺活动' : 'Event'}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
                    <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
                        <div className="flex-1 min-h-0 rounded-xl border p-4 flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white">
                                    <Check size={12} />
                                </div>
                                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '每日任务' : 'Daily Routines'}</h3>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>{routinesActive.length}</span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                                {routines.length === 0 && (
                                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>{isZh ? '暂无任务，点击上方 + 添加' : 'No routines yet'}</p>
                                )}
                                {routines.map(item => <ItemCard key={item.id} item={item} progress={progressMap[item.id] || 0} {...itemCardProps} />)}
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 rounded-xl border p-4 flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white">
                                    <Clock size={12} />
                                </div>
                                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '日程安排' : 'Schedule'}</h3>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>{schedules.length}</span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                                {schedules.length === 0 && (
                                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>{isZh ? '暂无日程' : 'No schedules yet'}</p>
                                )}
                                {schedules.map(item => <ItemCard key={item.id} item={item} progress={progressMap[item.id] || 0} {...itemCardProps} />)}
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0">
                        <div className="h-full rounded-xl border p-4 flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center text-white">
                                    <Store size={12} />
                                </div>
                                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '店铺活动' : 'Shop Events'}</h3>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>{shopEvents.length}</span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                                {shopEvents.length === 0 && (
                                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>{isZh ? '暂无活动' : 'No events'}</p>
                                )}
                                {shopEvents.map(item => <ItemCard key={item.id} item={item} progress={progressMap[item.id] || 0} {...itemCardProps} />)}
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0">
                        <div className="h-full rounded-xl border p-4 flex flex-col" style={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor: 'var(--border-default)',
                            backgroundImage: 'radial-gradient(circle, var(--border-default) 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                        }}>
                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
                                    <Lightbulb size={12} />
                                </div>
                                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '想法测试' : 'Ideas'}</h3>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>{ideas.length}</span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                                {ideas.length === 0 && (
                                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>{isZh ? '灵光一闪？记录下来' : 'Got an idea?'}</p>
                                )}
                                {ideas.map(item => <ItemCard key={item.id} item={item} progress={progressMap[item.id] || 0} {...itemCardProps} />)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={() => setShowArchive(true)}
                className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border transition-all hover:scale-105"
                style={{ backgroundColor: '#F2C94C', borderColor: 'rgba(242,201,76,0.3)' }}
            >
                <Archive size={20} style={{ color: '#2F3437' }} />
                {archivedItems.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: '#2F3437' }}>
                        {archivedItems.length}
                    </span>
                )}
            </button>

            {showArchive && (
                <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { setShowArchive(false); setArchiveSearch(''); setArchiveDateFilter(''); }}>
                    <div className="w-full max-w-lg h-full flex flex-col border-l" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)' }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-default)' }}>
                            <div className="flex items-center gap-2">
                                <Archive size={18} style={{ color: '#F2C94C' }} />
                                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '已完成档案' : 'Archive'}</h3>
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>{filteredArchived.length}/{archivedItems.length}</span>
                            </div>
                            <button onClick={() => { setShowArchive(false); setArchiveSearch(''); setArchiveDateFilter(''); }} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="px-5 py-3 border-b flex gap-2 shrink-0" style={{ borderColor: 'var(--border-default)' }}>
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                                <input type="text" value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
                                    placeholder={isZh ? '搜索标题...' : 'Search title...'}
                                    className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs outline-none transition-colors"
                                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                            </div>
                            <div className="relative">
                                <CalendarDays size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                                <input type="date" value={archiveDateFilter} onChange={e => setArchiveDateFilter(e.target.value)}
                                    className="h-8 pl-8 pr-2 rounded-lg border text-xs outline-none transition-colors"
                                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                                {archiveDateFilter && (
                                    <button onClick={() => setArchiveDateFilter('')}
                                        className="absolute -right-1 -top-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
                                        style={{ backgroundColor: 'var(--text-tertiary)', fontSize: '8px' }}>
                                        <X size={8} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-4">
                            {filteredArchived.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Archive size={32} className="mb-3 opacity-20" style={{ color: 'var(--text-tertiary)' }} />
                                    <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
                                        {archivedItems.length === 0 ? (isZh ? '还没有归档记录' : 'No archived items yet') : (isZh ? '没有匹配的结果' : 'No matching results')}
                                    </p>
                                </div>
                            ) : (
                                Object.entries(archivedByDate).sort(([a], [b]) => b.localeCompare(a)).map(([dateKey, dateItems]) => {
                                    const d = new Date(dateKey);
                                    const label = dateKey === formatDateShort(new Date().toISOString())
                                        ? (isZh ? '今天' : 'Today')
                                        : `${d.getMonth() + 1}/${d.getDate()}`;
                                    return (
                                        <div key={dateKey}>
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#F2C94C' }} />
                                                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                                                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-default)' }} />
                                            </div>
                                            <div className="space-y-2 pl-1 border-l-2 ml-1" style={{ borderColor: 'rgba(242,201,76,0.2)' }}>
                                                {dateItems.map(item => {
                                                    const config = TYPE_CONFIG[item.type];
                                                    return (
                                                        <div key={item.id} className="relative rounded-xl p-3 border ml-4" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)' }}>
                                                            <div className="absolute -left-[1.35rem] top-4 w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(242,201,76,0.4)' }} />
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${config.color} flex items-center justify-center text-white`}>
                                                                    {React.createElement(config.icon, { size: 10 })}
                                                                </div>
                                                                <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                                                                <span className="text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-tertiary)' }}>{formatDate(item.completedAt)}</span>
                                                            </div>
                                                            {(item.notes || item.feedback) && (
                                                                <div className="mt-2 space-y-1 pl-7">
                                                                    {item.notes && (
                                                                        <div className="flex items-start gap-1.5">
                                                                            <FileText size={10} className="mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                                                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.notes}</p>
                                                                        </div>
                                                                    )}
                                                                    {item.feedback && (
                                                                        <div className="flex items-start gap-1.5">
                                                                            <Edit3 size={10} className="mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                                                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.feedback}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {CreateModal}
            {EditModal}
            {IdeaCompleteModal}
        </div>
    );
};
