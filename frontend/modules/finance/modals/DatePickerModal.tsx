import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Calendar } from '../../../components/ui/calendar';
import { formatLocalDate, parseLocalDate } from '../../../lib/localDate';

interface DatePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (dateStr: string) => void;
    existingDates: Set<string>;
    initialDate?: string;
    locale?: string;
    t: { actions: { addDate: string; confirm: string } };
}

function DatePickerDialog({ onClose, onSelect, existingDates, initialDate, locale = 'zh-CN', t }: Omit<DatePickerModalProps, 'isOpen'>) {
    const [selectedDate, setSelectedDate] = useState(() => initialDate ?? formatLocalDate(new Date()));
    const unavailable = !parseLocalDate(selectedDate) || existingDates.has(selectedDate);
    return (
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent closeLabel={locale.startsWith('zh') ? '关闭' : 'Close'} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-y-auto rounded-xl p-0">
                <DialogHeader className="border-b border-border p-5 pr-12 text-left">
                    <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />{t.actions.addDate}</DialogTitle>
                    <DialogDescription>{locale.startsWith('zh') ? '已有流水的日期不可重复添加。' : 'Dates with existing transactions cannot be added again.'}</DialogDescription>
                </DialogHeader>
                <div className="p-5"><Calendar value={selectedDate} onValueChange={setSelectedDate} disabled={date => existingDates.has(date)} locale={locale} /></div>
                <DialogFooter className="border-t border-border p-4">
                    <Button className="w-full" disabled={unavailable} onClick={() => { if (!unavailable) { onSelect(selectedDate); onClose(); } }}>{t.actions.confirm}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({ isOpen, ...props }) => isOpen ? <DatePickerDialog {...props} /> : null;
