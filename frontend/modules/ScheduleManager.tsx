import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import api from '../src/api';
import {
    Archive, X, Sparkles, Edit3, Save, Search, CalendarDays
} from 'lucide-react';
import {
    normalizeType, TYPE_CONFIG, formatDate, formatDateShort, getGreeting,
    type ItemType, type ScheduleItemData,
} from './schedule/constants';
import { KanbanColumn } from './schedule/KanbanColumn';

export const ScheduleManager: React.FC = () => {
    const { strings, language } = useStore();
    const { user } = useAuth();
    const isZh = language === 'zh';

    const [items, setItems] = useState<ScheduleItemData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState<ItemType | null>(null);
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
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [expandedMobileColumn, setExpandedMobileColumn] = useState<ItemType | null>(null);
    const [archiveOpen, setArchiveOpen] = useState(false);
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
            const data = Array.isArray(res.data) ? res.data : [];
            setItems(data.map((item: any) => ({ ...item, type: normalizeType(item.type) })));
        } catch (e) {
            console.error('Failed to fetch schedule items', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchItems(); }, [fetchItems]);

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
                new Notification(i.title, {
                    body: i.deadline ? `${isZh ? '截止' : 'Due'}: ${formatDate(i.deadline)}` : (isZh ? '提醒时间已到' : 'Reminder time reached'),
                    icon: '/favicon.png',
                    tag: `schedule-${i.id}`,
                });
            });
        }
    }, [items]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
            setItems(prev => [{ ...res.data, type: normalizeType(res.data.type) }, ...prev]);
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
                setItems(prev => prev.map(i => i.id === item.id ? { ...res.data, type: normalizeType(res.data.type) } : i));
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
                setItems(prev => prev.map(i => i.id === item.id ? { ...res.data, type: normalizeType(res.data.type) } : i));
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
                setItems(prev => prev.map(i => i.id === itemRef.id ? { ...res.data, type: normalizeType(res.data.type) } : i));
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
            setItems(prev => prev.map(i => i.id === editingItem.id ? { ...res.data, type: normalizeType(res.data.type) } : i));
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

    const schedules = activeItems.filter(i => i.type === 'approval').sort((a, b) => a.sortKey - b.sortKey);
    const shopEvents = activeItems.filter(i => i.type === 'shop-event').sort((a, b) => a.sortKey - b.sortKey);
    const ideas = activeItems.filter(i => i.type === 'idea').sort((a, b) => a.sortKey - b.sortKey);
    const notifications = activeItems.filter(i => i.type === 'notification').sort((a, b) => a.sortKey - b.sortKey);

    const columnTypes: ItemType[] = ['routine', 'approval', 'shop-event', 'idea', 'notification'];
    const itemsByType: Record<ItemType, ScheduleItemData[]> = {
        routine: routines,
        approval: schedules,
        'shop-event': shopEvents,
        idea: ideas,
        notification: notifications,
        schedule: [],
    };

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
                    <button onClick={() => { setEditingItem(null); setEditNotes(''); setEditFeedback(''); }}
                        className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                        <X size={18} />
                    </button>
                </div>
                <div className="p-3 rounded-xl border mb-4" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{editingItem.title}</span>
                    {editingItem.description && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{editingItem.description}</p>
                    )}
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '笔记' : 'Notes'}</label>
                        <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                            placeholder={isZh ? '测试结果、数据、发现...' : 'Test results, data, findings...'}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--text-secondary)' }}>{isZh ? '反馈总结' : 'Feedback'}</label>
                        <textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} rows={2}
                            placeholder={isZh ? '学到了什么、是否需要继续跟进...' : 'What was learned, whether to follow up...'}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none transition-colors"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                    </div>
                    <button onClick={handleArchiveWithNotes}
                        className="w-full h-10 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 transition-all flex items-center justify-center gap-1.5">
                        <Sparkles size={14} />
                        {isZh ? '归档完成' : 'Archive Complete'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const renderSectionColumn = (type: ItemType, className?: string) => (
        <KanbanColumn
            type={type}
            items={itemsByType[type]}
            isAccordion={isMobile}
            isExpanded={expandedMobileColumn === type}
            onAccordionToggle={() => setExpandedMobileColumn(prev => prev === type ? null : type)}
            onCreate={setShowCreate}
            dragId={dragId}
            dragOverId={dragOverId}
            flyingItemId={flyingItemId}
            progressMap={progressMap}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onDoubleClick={handleDoubleClick}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
        />
    );

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-1 py-1.5 shrink-0">
                <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {todayStr} 周{todayWeekDay} · {getGreeting()}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {isZh ? `${activeItems.length} 个待办` : `${activeItems.length} pending`} · {isZh ? `${archivedItems.length} 个已归档` : `${archivedItems.length} archived`}
                    </p>
                </div>
                <button
                    onClick={() => setArchiveOpen(!archiveOpen)}
                    className="p-1.5 rounded-lg border shrink-0 transition-colors"
                    style={{
                        borderColor: 'var(--border-default)',
                        color: archiveOpen ? 'var(--accent-blue)' : 'var(--text-secondary)',
                        backgroundColor: archiveOpen ? 'var(--accent-blue-bg)' : 'transparent',
                    }}
                >
                    <Archive size={14} />
                </button>
            </div>

            {/* Content: 3列 + 归档面板 */}
            <div className="flex-1 flex min-h-0 gap-2">
                <div className="flex-1 flex min-w-0">
                    {activeItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
                                {isZh ? '完成所有任务！' : 'All tasks complete!'}
                            </p>
                        </div>
                    ) : isMobile ? (
                        <div className="flex-1 overflow-y-auto px-1 space-y-1.5">
                            {columnTypes.map(t => renderSectionColumn(t))}
                        </div>
                    ) : (
                        <div className="flex-1 kanban-grid min-h-0">
                            {/* Col 1: 每日任务 + 审批 */}
                            <div className="flex flex-col gap-2 min-h-0">
                                <div className="flex-1 min-h-0">{renderSectionColumn('routine')}</div>
                                <div className="flex-1 min-h-0">{renderSectionColumn('approval')}</div>
                            </div>
                            {/* Col 2: 店铺活动 + 想法测试 */}
                            <div className="flex flex-col gap-2 min-h-0">
                                <div className="flex-1 min-h-0">{renderSectionColumn('shop-event')}</div>
                                <div className="flex-1 min-h-0">{renderSectionColumn('idea')}</div>
                            </div>
                            {/* Col 3: 提醒 */}
                            {renderSectionColumn('notification')}
                        </div>
                    )}
                </div>

                {/* Archive Panel */}
                <div className={`archive-panel flex flex-col border-l ${archiveOpen ? '' : 'collapsed'}`}
                    style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}>
                    {archiveOpen ? (
                        <>
                            <div className="px-3 py-2 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border-default)' }}>
                                <div className="flex items-center gap-1.5">
                                    <Archive size={14} style={{ color: '#F2C94C' }} />
                                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{isZh ? '归档' : 'Archive'}</span>
                                </div>
                                <button onClick={() => setArchiveOpen(false)} className="p-0.5 rounded" style={{ color: 'var(--text-tertiary)' }}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="px-2 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-default)' }}>
                                <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                                    <input type="text" value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
                                        placeholder={isZh ? '搜索...' : 'Search...'}
                                        className="w-full h-7 pl-7 pr-2 rounded-lg border text-[11px] outline-none"
                                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-3">
                                {filteredArchived.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <Archive size={20} className="mb-2 opacity-20" style={{ color: 'var(--text-tertiary)' }} />
                                        <p className="text-[11px] font-medium text-center" style={{ color: 'var(--text-tertiary)' }}>
                                            {archivedItems.length === 0 ? (isZh ? '暂无归档' : 'No archive') : (isZh ? '无匹配结果' : 'No match')}
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
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                                                    <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-default)' }} />
                                                </div>
                                                <div className="space-y-1">
                                                    {dateItems.map(item => (
                                                        <div key={item.id} className="rounded-lg p-2" style={{ backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className={`w-3.5 h-3.5 rounded bg-gradient-to-br ${TYPE_CONFIG[item.type].color} flex items-center justify-center text-white shrink-0`}>
                                                                    {React.createElement(TYPE_CONFIG[item.type].icon, { size: 7 })}
                                                                </div>
                                                                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    ) : (
                        <button
                            onClick={() => setArchiveOpen(true)}
                            className="flex flex-col items-center py-3 w-full"
                            style={{ color: 'var(--text-tertiary)' }}
                            title={isZh ? '展开归档' : 'Expand archive'}
                        >
                            <Archive size={14} />
                            <span className="text-[9px] mt-1" style={{ writingMode: 'vertical-rl' }}>{isZh ? '归档' : 'Archive'}</span>
                        </button>
                    )}
                </div>
            </div>

            {CreateModal}
            {EditModal}
            {IdeaCompleteModal}
        </div>
    );
};
