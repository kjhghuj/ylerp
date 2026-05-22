import { Check, Clock, Lightbulb, Store, Bell, type LucideIcon } from 'lucide-react';

export type ItemType = 'routine' | 'approval' | 'idea' | 'shop-event' | 'notification' | 'schedule';

export const normalizeType = (t: string): ItemType => {
    if (t === 'schedule') return 'approval';
    return t as ItemType;
};

export interface ScheduleItemData {
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

export const TYPE_CONFIG: Record<ItemType, { icon: LucideIcon; color: string; label: string; labelEn: string; progressRgb: string }> = {
    routine: { icon: Check, color: 'from-emerald-400 to-teal-500', label: '每日任务', labelEn: 'Routine', progressRgb: '129,199,132' },
    approval: { icon: Clock, color: 'from-blue-400 to-indigo-500', label: '审批', labelEn: 'Approval', progressRgb: '100,181,246' },
    schedule: { icon: Clock, color: 'from-blue-400 to-indigo-500', label: '审批', labelEn: 'Approval', progressRgb: '100,181,246' },
    idea: { icon: Lightbulb, color: 'from-amber-400 to-orange-500', label: '想法测试', labelEn: 'Idea', progressRgb: '255,183,77' },
    'shop-event': { icon: Store, color: 'from-purple-400 to-violet-500', label: '店铺活动', labelEn: 'Shop Event', progressRgb: '179,136,255' },
    notification: { icon: Bell, color: 'from-red-400 to-rose-500', label: '提醒', labelEn: 'Notification', progressRgb: '244,114,182' },
};

export const getDeadlineStatus = (deadline?: string): 'safe' | 'warning' | 'urgent' | 'none' => {
    if (!deadline) return 'none';
    const now = Date.now();
    const dl = new Date(deadline).getTime();
    const diff = dl - now;
    if (diff < 0) return 'urgent';
    if (diff < 24 * 60 * 60 * 1000) return 'urgent';
    if (diff < 48 * 60 * 60 * 1000) return 'warning';
    return 'safe';
};

export const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，注意休息';
    if (h < 12) return '早安，今日事今日毕';
    if (h < 18) return '午后好，继续加油';
    return '晚安，别忘了复盘';
};
