import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import React, { useState } from 'react';
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (dateStr: string) => void;
    existingDates: Set<string>;
    t: any;
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({ isOpen, onClose, onSelect, existingDates, t }) => {
      const today = new Date();
      const [viewYear, setViewYear] = useState(today.getFullYear());
      const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
      const [selDate, setSelDate] = useState(today.toISOString().split('T')[0]);

      if (!isOpen) return null;

      const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
      const daysInMonth = getDaysInMonth(viewYear, viewMonth);
      const firstDayOffset = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 is Sunday

      const changeMonth = (delta: number) => {
          let m = viewMonth + delta;
          let y = viewYear;
          if (m > 12) { m = 1; y++; }
          if (m < 1) { m = 12; y--; }
          setViewMonth(m);
          setViewYear(y);
      };

      const handleConfirm = () => {
          onSelect(selDate);
          onClose();
      };

      return (
          <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent showCloseButton={false} aria-describedby={undefined} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-xl p-0">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                      <DialogTitle className="font-bold text-lg text-foreground flex items-center gap-2">
                        <Plus size={18} className="text-purple-600"/>
                        {t.actions.addDate}
                      </DialogTitle>
                      <Button aria-label="关闭" variant="ghost" size="sm" onClick={onClose}><X size={20} className="text-muted-foreground hover:text-purple-600 transition"/></Button>
                  </div>

                  <div className="flex items-center justify-between mb-4 px-2">
                      <Button aria-label="上一月" variant="ghost" size="sm" onClick={() => changeMonth(-1)} className="p-2 hover:bg-muted rounded-full transition text-muted-foreground"><ChevronLeft size={20}/></Button>
                      <span className="font-bold text-indigo-800 text-lg">{viewYear}年 {viewMonth}月</span>
                      <Button aria-label="下一月" variant="ghost" size="sm" onClick={() => changeMonth(1)} className="p-2 hover:bg-muted rounded-full transition text-muted-foreground"><ChevronRight size={20}/></Button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                          <span key={d} className="text-xs text-muted-foreground font-bold uppercase">{d}</span>
                      ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-6">
                      {Array.from({length: firstDayOffset}).map((_, i) => <div key={`empty-${i}`} />)}
                      {Array.from({length: daysInMonth}, (_, i) => i + 1).map(d => {
                          const dateStr = `${viewYear}-${viewMonth.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                          const exists = existingDates.has(dateStr);
                          const isSelected = selDate === dateStr;
                          return (
                              <Button variant="ghost" size="sm"
                                  key={d}
                                  disabled={exists}
                                  onClick={() => setSelDate(dateStr)}
                                  className={`aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition relative
                                      ${exists ? 'bg-muted text-muted-foreground cursor-not-allowed decoration-slate-300' : 
                                        isSelected ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-purple-50 hover:text-purple-600'}
                                  `}
                              >
                                  {d}
                                  {exists && <span className="absolute w-1 h-1 bg-slate-300 rounded-full bottom-1"></span>}
                              </Button>
                          );
                      })}
                  </div>

                  <Button variant="default" size="sm" onClick={handleConfirm} className="w-full font-bold py-3 transition active:translate-y-0.5">
                      {t.actions.confirm}
                  </Button>
              </DialogContent>
        </Dialog>
      );
};
