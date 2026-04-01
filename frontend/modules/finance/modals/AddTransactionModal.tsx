import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FinanceRecord } from '../../../types';
import { useToast } from '../../../components/Toast';

interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (record: Omit<FinanceRecord, 'id' | 'accountId'>) => void;
    initialDate: string;
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

const createEmptyFields = (): Record<string, FieldState> => {
    const f: Record<string, FieldState> = {};
    FIELD_CONFIG.forEach(cfg => { f[cfg.key] = { amount: '', note: '' }; });
    return f;
};

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose, onAdd, initialDate, t }) => {
    const { showToast } = useToast();
    const [date, setDate] = useState(initialDate);
    const [fields, setFields] = useState<Record<string, FieldState>>(createEmptyFields);

    if (!isOpen) return null;

    const updateField = (key: string, field: 'amount' | 'note', value: string) => {
        setFields(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value }
        }));
    };

    const resetAndClose = () => {
        setDate(initialDate);
        setFields(createEmptyFields());
        onClose();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        let hasData = false;

        for (const cfg of FIELD_CONFIG) {
            const f = fields[cfg.key];
            const amount = parseFloat(f.amount || '0');
            if (isNaN(amount) || amount === 0) continue;
            hasData = true;

            if (cfg.key === 'other') {
                onAdd({
                    date,
                    type: amount > 0 ? 'income' : 'expense',
                    amount: Math.abs(amount),
                    category: 'General',
                    description: f.note || '其他收支',
                });
            } else {
                onAdd({
                    date,
                    type: cfg.type as FinanceRecord['type'],
                    amount,
                    category: cfg.category,
                    description: f.note || cfg.label,
                });
            }
        }

        if (hasData) {
            showToast('添加成功', 'success');
            resetAndClose();
        } else {
            showToast('请至少填写一项金额', 'error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={resetAndClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] border border-white/50" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-xl shadow-sm text-indigo-600"><Plus size={20} /></div>
                        <h3 className="text-lg font-bold text-slate-800">{t.form.add}</h3>
                    </div>
                    <button onClick={resetAndClose} className="p-2 hover:bg-white/80 rounded-xl transition text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-500 font-bold uppercase shrink-0">日期</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/50 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition"
                        />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-3 flex-1">
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
                </form>

                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-2xl">
                    <button onClick={resetAndClose} type="button" className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition">取消</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-0.5 transition flex items-center gap-2">
                        <Plus size={16} /> {t.form.add}
                    </button>
                </div>
            </div>
        </div>
    );
};
