import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
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
    { key: 'otherIncome', type: 'income', category: '其他收入', label: '其他收入', color: 'teal' },
    { key: 'otherExpense', type: 'expense', category: '其他支出', label: '其他支出', color: 'rose' },
] as const;

const COLORS: Record<string, { bg: string; text: string; border: string; focus: string }> = {
    emerald: { bg: 'bg-success-subtle', text: 'text-success', border: 'border-success/20', focus: 'focus:border-emerald-400 focus:ring-emerald-100' },
    amber: { bg: 'bg-warning-subtle', text: 'text-warning', border: 'border-warning/20', focus: 'focus:border-amber-400 focus:ring-amber-100' },
    indigo: { bg: 'bg-accent', text: 'text-primary', border: 'border-indigo-200', focus: 'focus:border-primary focus:ring-indigo-100' },
    slate: { bg: 'bg-muted', text: 'text-foreground', border: 'border-border', focus: 'focus:border-slate-400 focus:ring-slate-100' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', focus: 'focus:border-teal-400 focus:ring-teal-100' },
    rose: { bg: 'bg-destructive/10', text: 'text-danger', border: 'border-destructive/20', focus: 'focus:border-rose-400 focus:ring-rose-100' },
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
            let matched;
            if (cfg.key === 'otherIncome') {
                matched = dayRecords.find(r => r.type === 'income' && r.category !== 'Revenue');
            } else if (cfg.key === 'otherExpense') {
                matched = dayRecords.find(r => r.type === 'expense' && !['Operations', 'Logistics', 'HR'].includes(r.category));
            } else {
                matched = dayRecords.find(r => r.type === cfg.type && r.category === cfg.category);
            }
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
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent showCloseButton={false} aria-label={date || ''} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-xl p-0">
                <div className="p-5 border-b border-border flex justify-between items-center bg-muted/40 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-card rounded-xl shadow-sm text-primary"><Calendar size={20} /></div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-foreground">{date}</DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">编辑当日财务数据</DialogDescription>
                        </div>
                    </div>
                    <Button aria-label="关闭" variant="ghost" size="sm" onClick={onClose} className="p-2 hover:bg-card/80 rounded-xl transition text-muted-foreground hover:text-muted-foreground"><X size={20} /></Button>
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

                    {date && (() => {
                        const dayRecords = financeRecords.filter(r => r.date === date);
                        const creator = dayRecords.find(r => r.user?.displayName)?.user?.displayName;
                        const modifier = dayRecords.find(r => r.updatedBy)?.updatedBy;
                        if (!creator && !modifier) return null;
                        return (
                            <div className="mt-3 px-4 py-3 bg-muted rounded-xl border border-border text-xs text-muted-foreground space-y-1">
                                {creator && <p>创建者: <span className="font-medium text-foreground">{creator}</span></p>}
                                {modifier && <p>最后修改: <span className="font-medium text-foreground">{modifier}</span></p>}
                            </div>
                        );
                    })()}
                </div>

                <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/50 rounded-b-2xl">
                    <Button variant="ghost" size="sm" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:bg-card transition">取消</Button>
                    <Button variant="default" size="sm" onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                        <Save size={16} />{saving ? '保存中...' : '保存'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
