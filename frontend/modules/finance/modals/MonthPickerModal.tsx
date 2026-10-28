import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface MonthPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (dateStr: string) => void;
    existingMonths: Set<string>;
    t: any;
}

export const MonthPickerModal: React.FC<MonthPickerModalProps> = ({ isOpen, onClose, onSelect, existingMonths, t }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [selYear, setSelYear] = useState(currentYear);
    const [selMonth, setSelMonth] = useState(currentMonth);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const monthStr = `${selYear}-${selMonth.toString().padStart(2, '0')}`;
        // Set active date to 1st of that month
        onSelect(`${monthStr}-01`);
        onClose();
    };

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent showCloseButton={false} aria-describedby={undefined} aria-label={t.actions.addMonth} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-xl p-0">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <DialogTitle className="font-bold text-lg text-foreground flex items-center gap-2">
                        <Calendar size={18} className="text-primary"/>
                        {t.actions.addMonth}
                    </DialogTitle>
                    <Button aria-label="关闭" variant="ghost" size="sm" onClick={onClose}><X size={20} className="text-muted-foreground hover:text-primary transition"/></Button>
                </div>
                
                <div className="mb-4">
                    <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase">{t.actions.selectYear}</label>
                    <div className="flex items-center justify-between bg-muted p-2 rounded-xl border border-border">
                        <Button aria-label="上一年" variant="ghost" size="sm" onClick={() => setSelYear(y => y - 1)} className="p-2 hover:bg-card hover:shadow-sm rounded-lg transition text-muted-foreground"><ChevronLeft size={16}/></Button>
                        <span className="font-bold text-primary text-lg">{selYear}</span>
                        <Button aria-label="下一年" variant="ghost" size="sm" onClick={() => setSelYear(y => y + 1)} className="p-2 hover:bg-card hover:shadow-sm rounded-lg transition text-muted-foreground"><ChevronRight size={16}/></Button>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase">{t.actions.selectMonth}</label>
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                            const monthStr = `${selYear}-${m.toString().padStart(2, '0')}`;
                            const exists = existingMonths.has(monthStr);
                            return (
                                <Button variant="ghost" size="sm"
                                    key={m}
                                    disabled={exists}
                                    onClick={() => setSelMonth(m)}
                                    className={`py-2 rounded-lg text-sm font-medium transition
                                        ${exists ? 'bg-muted text-muted-foreground cursor-not-allowed' : 
                                          selMonth === m ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-primary'}
                                    `}
                                >
                                    {m}月
                                </Button>
                            );
                        })}
                    </div>
                </div>

                <Button variant="default" size="sm" onClick={handleConfirm} className="w-full font-bold py-3 transition active:translate-y-0.5">
                    {t.actions.confirm}
                </Button>
            </DialogContent>
        </Dialog>
    );
};
