import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { DatePicker } from '../../../components/DatePicker';
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FinanceRecord } from '../../../types';
import { useToast } from '../../../components/Toast';

interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (record: Omit<FinanceRecord, 'id' | 'accountId'>) => void;
    initialDate: string;
    locale?: string;
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
    emerald: { bg: 'bg-success-subtle', text: 'text-success', border: 'border-success/20', focus: 'focus:border-emerald-400 focus:ring-emerald-100' },
    amber: { bg: 'bg-warning-subtle', text: 'text-warning', border: 'border-warning/20', focus: 'focus:border-amber-400 focus:ring-amber-100' },
    indigo: { bg: 'bg-accent', text: 'text-primary', border: 'border-indigo-200', focus: 'focus:border-primary focus:ring-indigo-100' },
    slate: { bg: 'bg-muted', text: 'text-foreground', border: 'border-border', focus: 'focus:border-slate-400 focus:ring-slate-100' },
};

const createEmptyFields = (): Record<string, FieldState> => {
    const f: Record<string, FieldState> = {};
    FIELD_CONFIG.forEach(cfg => { f[cfg.key] = { amount: '', note: '' }; });
    return f;
};

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose, onAdd, initialDate, locale, t }) => {
    const { showToast } = useToast();
    const [date, setDate] = useState(initialDate);
    const [fields, setFields] = useState<Record<string, FieldState>>(createEmptyFields);
    const dateId = React.useId();

    React.useEffect(() => {
        if (isOpen) setDate(initialDate);
    }, [isOpen, initialDate]);

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
        <Dialog open onOpenChange={open => { if (!open) resetAndClose(); }}>
            <DialogContent showCloseButton={false} aria-describedby={undefined} aria-label={t.form.add} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-xl p-0">
                <div className="p-5 border-b border-border flex justify-between items-center bg-muted/40 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-card rounded-xl shadow-sm text-primary"><Plus size={20} /></div>
                        <DialogTitle className="text-lg font-bold text-foreground">{t.form.add}</DialogTitle>
                    </div>
                    <Button aria-label="关闭" variant="ghost" size="sm" onClick={resetAndClose} className="p-2 hover:bg-card/80 rounded-xl transition text-muted-foreground hover:text-muted-foreground"><X size={20} /></Button>
                </div>

                <div className="p-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <label htmlFor={dateId} className="text-xs text-muted-foreground font-bold uppercase shrink-0">日期</label>
                        <DatePicker
                            id={dateId} aria-label="日期" locale={locale}
                            value={date}
                            onValueChange={setDate}
                            className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/50 outline-none text-sm font-medium focus:border-primary focus:ring-1 focus:ring-indigo-100 transition"
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
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">¥</span>
                                        <Input
                                            type="number" aria-label={`${cfg.label}金额`} step="0.01"
                                            value={f.amount}
                                            onChange={e => updateField(cfg.key, 'amount', e.target.value)}
                                            placeholder="0.00"
                                            className={`w-full pl-7 pr-3 py-2 rounded-lg border ${c.border} bg-card text-sm font-medium text-foreground outline-none ${c.focus} transition`}
                                        />
                                    </div>
                                    <Input
                                        type="text" aria-label={`${cfg.label}备注`} value={f.note}
                                        onChange={e => updateField(cfg.key, 'note', e.target.value)}
                                        placeholder="备注（选填）"
                                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition placeholder:text-muted-foreground"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </form>

                <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/50 rounded-b-2xl">
                    <Button variant="ghost" size="sm" onClick={resetAndClose} type="button" className="px-5 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:bg-card transition">取消</Button>
                    <Button variant="default" size="sm" onClick={handleSubmit} className="px-6 py-2.5 text-sm font-bold transition flex items-center gap-2">
                        <Plus size={16} /> {t.form.add}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
