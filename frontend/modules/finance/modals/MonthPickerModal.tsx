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
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white/95 backdrop-blur-lg rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-white/50 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Calendar size={18} className="text-indigo-600"/>
                        {t.actions.addMonth}
                    </h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-indigo-600 transition"/></button>
                </div>
                
                <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">{t.actions.selectYear}</label>
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <button onClick={() => setSelYear(y => y - 1)} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition text-slate-600"><ChevronLeft size={16}/></button>
                        <span className="font-bold text-indigo-700 text-lg">{selYear}</span>
                        <button onClick={() => setSelYear(y => y + 1)} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition text-slate-600"><ChevronRight size={16}/></button>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">{t.actions.selectMonth}</label>
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                            const monthStr = `${selYear}-${m.toString().padStart(2, '0')}`;
                            const exists = existingMonths.has(monthStr);
                            return (
                                <button
                                    key={m}
                                    disabled={exists}
                                    onClick={() => setSelMonth(m)}
                                    className={`py-2 rounded-lg text-sm font-medium transition
                                        ${exists ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 
                                          selMonth === m ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}
                                    `}
                                >
                                    {m}月
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button onClick={handleConfirm} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-200 active:translate-y-0.5">
                    {t.actions.confirm}
                </button>
            </div>
        </div>
    );
};
