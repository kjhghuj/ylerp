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
          <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white/95 backdrop-blur-lg rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-white/50 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Plus size={18} className="text-purple-600"/>
                        {t.actions.addDate}
                      </h3>
                      <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-purple-600 transition"/></button>
                  </div>

                  <div className="flex items-center justify-between mb-4 px-2">
                      <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-600"><ChevronLeft size={20}/></button>
                      <span className="font-bold text-indigo-800 text-lg">{viewYear}年 {viewMonth}月</span>
                      <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-600"><ChevronRight size={20}/></button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                          <span key={d} className="text-xs text-slate-400 font-bold uppercase">{d}</span>
                      ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-6">
                      {Array.from({length: firstDayOffset}).map((_, i) => <div key={`empty-${i}`} />)}
                      {Array.from({length: daysInMonth}, (_, i) => i + 1).map(d => {
                          const dateStr = `${viewYear}-${viewMonth.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                          const exists = existingDates.has(dateStr);
                          const isSelected = selDate === dateStr;
                          return (
                              <button
                                  key={d}
                                  disabled={exists}
                                  onClick={() => setSelDate(dateStr)}
                                  className={`aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition relative
                                      ${exists ? 'bg-slate-50 text-slate-300 cursor-not-allowed decoration-slate-300' : 
                                        isSelected ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'text-slate-700 hover:bg-purple-50 hover:text-purple-600'}
                                  `}
                              >
                                  {d}
                                  {exists && <span className="absolute w-1 h-1 bg-slate-300 rounded-full bottom-1"></span>}
                              </button>
                          );
                      })}
                  </div>

                  <button onClick={handleConfirm} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-200 active:translate-y-0.5">
                      {t.actions.confirm}
                  </button>
              </div>
          </div>
      );
};
