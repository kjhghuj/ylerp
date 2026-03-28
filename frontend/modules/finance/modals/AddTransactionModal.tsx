import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FinanceRecord } from '../../../types';

interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (record: Omit<FinanceRecord, 'id' | 'accountId' | 'category'>) => void;
    initialDate: string;
    t: any;
}

const createInitialState = (initialDate: string) => ({
    type: 'income',
    amount: '',
    description: '',
    date: initialDate
});

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose, onAdd, initialDate, t }) => {
    const [newTrans, setNewTrans] = useState(() => createInitialState(initialDate));

    if (!isOpen) return null;

    const resetAndClose = () => {
        setNewTrans(createInitialState(initialDate));
        onClose();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const parsedAmount = parseFloat(newTrans.amount.toString());
        if (isNaN(parsedAmount) || parsedAmount <= 0 || !newTrans.description) {
            return;
        }

        onAdd({
            type: newTrans.type as any,
            amount: parsedAmount,
            description: newTrans.description!,
            date: newTrans.date,
        });

        resetAndClose();
    };

    return (
      <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-white/50 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                  <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                      <Plus size={18} className="text-indigo-600"/>
                      {t.form.add}
                  </h3>
                  <button onClick={resetAndClose}><X size={20} className="text-slate-400 hover:text-indigo-600 transition"/></button>
              </div>
              
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-500 font-bold ml-1 uppercase">{t.form.date}</label>
                      <input 
                          type="date" 
                          value={newTrans.date}
                          onChange={e => setNewTrans({...newTrans, date: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 outline-none text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all"
                      />
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-500 font-bold ml-1 uppercase">{t.labels.type}</label>
                      <select 
                          value={newTrans.type} 
                          onChange={e => setNewTrans({...newTrans, type: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 outline-none text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                      >
                          <option value="income">{t.form.income}</option>
                          <option value="expense">{t.form.expense}</option>
                          <option value="new_debt">{t.form.borrow}</option>
                          <option value="debt_repayment">{t.form.repay}</option>
                      </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-500 font-bold ml-1 uppercase">{t.labels.amount}</label>
                      <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
                          <input 
                              type="number" 
                              placeholder="0.00"
                              value={newTrans.amount}
                              onChange={e => setNewTrans({...newTrans, amount: e.target.value})}
                              className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 outline-none text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all"
                              autoFocus
                          />
                      </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-500 font-bold ml-1 uppercase">{t.labels.desc}</label>
                      <input 
                          type="text" 
                          placeholder={t.form.descPlaceholder} 
                          value={newTrans.description}
                          onChange={e => setNewTrans({...newTrans, description: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 outline-none text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all"
                      />
                  </div>

                  <button type="submit" className="mt-2 w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white h-[42px] flex items-center justify-center rounded-xl transition shadow-lg shadow-indigo-200 active:translate-y-0.5 font-bold text-sm gap-2">
                      <Plus size={18} /> {t.form.add}
                  </button>
              </form>
          </div>
      </div>
    );
};
