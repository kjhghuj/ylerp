import React from 'react';
import { Calendar, X, Edit2, Trash2 } from 'lucide-react';
import { useStore } from '../../../StoreContext';

interface DayDetailModalProps {
    date: string | null;
    onClose: () => void;
    t: any;
    getTypeLabel: (type: string) => string;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({ date, onClose, t, getTypeLabel }) => {
    const { financeRecords, updateTransaction, deleteTransaction } = useStore();
    
    if (!date) return null;

    const records = financeRecords.filter(r => r.date === date);

    const handleRemarkChange = (id: string, newDesc: string) => {
        const record = records.find(r => r.id === id);
        if (record) updateTransaction({ ...record, description: newDesc });
    };

    const handleDelete = (id: string) => {
        if(window.confirm(t.actions.deleteConfirm)) {
            deleteTransaction(id); 
            if(records.length <= 1) onClose();
        }
    };

    return (
      <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh] border border-white/50 animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/30 rounded-t-2xl">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                         <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600"><Calendar size={20}/></div>
                         {date}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1 ml-11">{records.length} Transactions</p>
                  </div>
                  <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400 hover:text-slate-600"><X size={24} /></button>
              </div>
              <div className="overflow-y-auto p-0 flex-1">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-indigo-50/50 text-indigo-600 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                          <tr>
                              <th className="p-4 font-semibold">{t.labels.type}</th>
                              <th className="p-4 font-semibold text-right">{t.labels.amount}</th>
                              <th className="p-4 font-semibold w-1/2">{t.labels.desc} <span className="text-xs font-normal text-indigo-400/70">(Editable)</span></th>
                              <th className="p-4 w-16"></th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {records.map(rec => (
                              <tr key={rec.id} className="group hover:bg-slate-50 transition">
                                  <td className="p-4">
                                      <div className="flex flex-col">
                                          <span className={`px-2.5 py-1 rounded-full w-fit text-xs font-bold uppercase tracking-wide mb-1
                                              ${(rec.type === 'income' || rec.type === 'new_debt') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}
                                          `}>
                                              {getTypeLabel(rec.type)}
                                          </span>
                                          <span className="text-xs text-slate-400 font-medium pl-1">{rec.category}</span>
                                      </div>
                                  </td>
                                  <td className={`p-4 text-right font-bold text-base ${(rec.type === 'income' || rec.type === 'new_debt') ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {(rec.type === 'income' || rec.type === 'new_debt') ? '+' : '-'}¥{rec.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-4">
                                      <div className="relative group/edit">
                                          <input type="text" defaultValue={rec.description} onBlur={(e) => handleRemarkChange(rec.id, e.target.value)} onKeyDown={(e) => {if(e.key === 'Enter') e.currentTarget.blur();}} className="w-full p-2 rounded-lg border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 focus:bg-white bg-transparent transition outline-none text-slate-700 font-medium"/>
                                          <Edit2 size={12} className="absolute right-2 top-3 text-slate-300 pointer-events-none opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                      </div>
                                  </td>
                                  <td className="p-4 text-right">
                                      <button onClick={() => handleDelete(rec.id)} className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Delete"><Trash2 size={16} /></button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
    );
};
