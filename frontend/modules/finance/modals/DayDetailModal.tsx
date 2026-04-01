import React, { useState, useEffect } from 'react';
import { Calendar, X, Save } from 'lucide-react';
import { useStore } from '../../../StoreContext';
import { useToast } from '../../../components/Toast';

interface DayDetailModalProps {
    date: string | null;
    onClose: () => void;
    t: any;
}

interface FieldState {
    amount: string;
    note: string;
}

const FIELD_CONFIG = [
    { key: 'income', type: 'income', category: 'Revenue', label: '营业收入', color: 'emerald' },
    { key: 'new_debt', type: 'new_debt', category: 'Loans', label: '新增借入', color: 'amber' },
    { key: 'debt_repayment', type: 'debt_repayment', category: 'Debt Service', label: '债务偿还', color: 'indigo' },
    { key: 'rentUtilities', type: 'expense', category: 'Operations', label: '房租水电', color: 'slate' },
    { key: 'freightCost', type: 'expense', category: 'Logistics', label: '物流运费', color: 'slate' },
    { key: 'salary', type: 'expense', category: 'HR', label: '人工薪资', color: 'slate' },
    { key: 'other', type: 'other', category: '', label: '其他收支', color: 'slate' },
] as const;

const COLORS: Record<string, { bg: string; text: string; border: string; focus: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', focus: 'focus:border-emerald-400 focus:ring-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', focus: 'focus:border-amber-400 focus:ring-amber-100' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', focus: 'focus:border-indigo-400 focus:ring-indigo-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', focus: 'focus:border-slate-400 focus:ring-slate-100' },
};

export const DayDetailModal: React.FC<DayDetailModalProps> = ({ date, onClose, t }) => {
    const { financeRecords, deleteTransaction, addTransaction } = useStore();
    const { showToast } = useToast();
    const [fields, setFields] = useState<Record<string, FieldState>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!date) return;
        const dayRecords = financeRecords.filter(r => r.date === date);
        const newFields: Record<string, FieldState> = {};

        FIELD_CONFIG.forEach(cfg => {
            let matched = dayRecords.find(r => {
                if (cfg.key === 'other') return r.type === 'income' && r.category !== 'Revenue' || r.type === 'expense' && !['Operations', 'Logistics', 'HR'].includes(r.category);
                return r.type === cfg.type && r.category === cfg.category;
            });
            newFields[cfg.key] = {
                amount: matched ? matched.amount.toString() : '',
                note: matched ? matched.description : '',
            };
        });

        setFields(newFields);
    }, [date, financeRecords]);

    if (!date) return null;

    const updateField = (key: string, field: 'amount' | 'note', value: string) => {
        setFields(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const dayRecords = financeRecords.filter(r => r.date === date);
            for (const rec of dayRecords) {
                await deleteTransaction(rec.id);
            }

            for (const cfg of FIELD_CONFIG) {
                const f = fields[cfg.key];
                const amount = parseFloat(f?.amount || '0');
                if (isNaN(amount) || amount === 0) continue;

                if (cfg.key === 'other') {
                    await addTransaction({
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                        date,
                        type: amount > 0 ? 'income' : 'expense',
                        amount: Math.abs(amount),
                        category: 'General',
                        description: f?.note || '其他收支',
                        accountId: 'main'
                    });
                } else {
                    await addTransaction({
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                        date,
                        type: cfg.type as any,
                        amount,
                        category: cfg.category,
                        description: f?.note || cfg.label,
                        accountId: 'main'
                    });
                }
            }
            showToast('保存成功', 'success');
            onClose();
        } catch (e) {
            console.error('Save failed', e);
            showToast('保存失败', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] border border-white/50" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-xl shadow-sm text-indigo-600"><Calendar size={20} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{date}</h3>
                            <p className="text-xs text-slate-400">编辑当日财务数据</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/80 rounded-xl transition text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="overflow-y-auto p-5 space-y-3 flex-1">
                    {FIELD_CONFIG.map(cfg => {
                        const c = COLORS[cfg.color];
                        const f = fields[cfg.key] || { amount: '', note: '' };
                        return (
                            <div key={cfg.key} className={`rounded-xl border ${c.border} ${c.bg} p-4 transition hover:shadow-sm`}>
                                <label className={`text-sm font-bold ${c.text} mb-2 block`}>{cfg.label}</label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">¥</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={f.amount}
                                            onChange={e => updateField(cfg.key, 'amount', e.target.value)}
                                            placeholder="0.00"
                                            className={`w-full pl-7 pr-3 py-2 rounded-lg border ${c.border} bg-white text-sm font-medium text-slate-800 outline-none ${c.focus} transition`}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={f.note}
                                        onChange={e => updateField(cfg.key, 'note', e.target.value)}
                                        placeholder="备注（选填）"
                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition placeholder:text-slate-300"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-2xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition">取消</button>
                    <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                        <Save size={16} />{saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
};
