import React, { useState, useMemo } from 'react';
import { useStore } from '../StoreContext';
import {
    Plus, ChevronDown, Calendar,
    TrendingUp, TrendingDown, DollarSign, CreditCard,
    Check, Wallet, ArrowRightLeft, Upload, Trash2
} from 'lucide-react';
import { FinanceRecord } from '../types';

// Imported Components
import { KPICard } from './finance/components/KPICard';
import { FinanceCharts } from './finance/components/FinanceCharts';
import { MonthPickerModal } from './finance/modals/MonthPickerModal';
import { DatePickerModal } from './finance/modals/DatePickerModal';
import { AddTransactionModal } from './finance/modals/AddTransactionModal';
import { DayDetailModal } from './finance/modals/DayDetailModal';

export const FinanceManager: React.FC = () => {
    const { financeRecords, addTransaction, importTransactions, clearAllTransactions, accountBalance, totalDebt, strings, language } = useStore();
    const t = strings.finance;
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // --- Active Date State (Defaults to Today) ---
    const [activeDate, setActiveDate] = useState(new Date().toISOString().split('T')[0]);

    // --- Modal States ---
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showAddTransModal, setShowAddTransModal] = useState(false);
    const [selectedDetailDate, setSelectedDetailDate] = useState<string | null>(null);

    // --- Accordion State ---
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

    // --- Existing Data Sets (for disabling) ---
    const existingMonths = useMemo(() => new Set(financeRecords.map(r => r.date.substring(0, 7))), [financeRecords]);
    const existingDates = useMemo(() => new Set(financeRecords.map(r => r.date)), [financeRecords]);

    // --- Handlers ---
    const handleAddTransaction = (data: Omit<FinanceRecord, 'id' | 'accountId' | 'category'>) => {
        addTransaction({
            id: Date.now().toString(),
            ...data,
            category: 'General',
            accountId: 'main'
        });

        // Auto expand the month
        const monthKey = data.date.substring(0, 7);
        setExpandedMonths(prev => new Set(prev).add(monthKey));
    };

    const openAddTransModal = () => {
        setShowAddTransModal(true);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const rawData = JSON.parse(text);
                
                const newRecords: Omit<FinanceRecord, 'id'>[] = [];
                
                rawData.forEach((monthGroup: any) => {
                    const monthMatch = monthGroup.month?.match(/(\d{4})年(\d{1,2})月/);
                    if (!monthMatch) return;
                    const year = parseInt(monthMatch[1]);
                    const month = parseInt(monthMatch[2]);
                    
                    if(!Array.isArray(monthGroup.days)) return;

                    monthGroup.days.forEach((day: any) => {
                        const dayMatch = day.date?.match(/(\d{1,2})日/);
                        if (!dayMatch) return;
                        const dayNum = parseInt(dayMatch[1]);
                        
                        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                        const notes = day.notes || '';
                        
                        const parseAmount = (val: any) => {
                            if (!val) return 0;
                            const num = parseFloat(val.toString().replace(/,/g, ''));
                            return isNaN(num) ? 0 : num;
                        };

                        const addRecord = (val: any, type: FinanceRecord['type'], category: string, descPrefix: string) => {
                            const amount = parseAmount(val);
                            if (amount > 0) {
                                newRecords.push({
                                    date: dateStr,
                                    type,
                                    amount,
                                    category,
                                    description: notes ? `${descPrefix} - ${notes}` : descPrefix,
                                    accountId: 'main'
                                });
                            }
                        };

                        addRecord(day.expectedIncome, 'income', 'Revenue', 'Income');
                        addRecord(day.newDebt, 'new_debt', 'Loans', 'New Loan');
                        addRecord(day.repayment, 'debt_repayment', 'Debt Service', 'Repayment');
                        addRecord(day.rentUtilities, 'expense', 'Operations', 'Rent/Utilities');
                        addRecord(day.freightCost, 'expense', 'Logistics', 'Freight');
                        addRecord(day.salary, 'expense', 'HR', 'Salary');
                    });
                });

                if(newRecords.length > 0) {
                    await importTransactions(newRecords);
                    alert(`导入成功！共导入了 ${newRecords.length} 条流水数据。`);
                } else {
                    alert('未找到有效的可导入数据，请检查 JSON 格式。');
                }
                
            } catch (error) {
                console.error("Failed to parse JSON", error);
                alert("文件解析失败，请确保格式是正确的 JSON");
            } finally {
                if(fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleClearData = async () => {
        if (financeRecords.length === 0) return;
        if (window.confirm("确定要清空所有的财务流水数据吗？清空后将无法恢复！")) {
            await clearAllTransactions();
            alert("账本数据已全部清空。");
        }
    };

    // --- Calculations for Top KPIs ---
    const totalIncome = useMemo(() => {
        return financeRecords
            .filter(r => r.type === 'income')
            .reduce((sum, r) => sum + r.amount, 0);
    }, [financeRecords]);

    const totalExpense = useMemo(() => {
        return financeRecords
            .filter(r => r.type === 'expense')
            .reduce((sum, r) => sum + r.amount, 0);
    }, [financeRecords]);

    // --- Data Processing for Chart ---
    const sortedRecords = [...financeRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    let runningDebt = 0;
    let runningIncome = 0;
    let runningExpense = 0;

    const chartData = sortedRecords.map(record => {
        if (record.type === 'income' || record.type === 'new_debt') {
            runningBalance += record.amount;
        } else {
            runningBalance -= record.amount;
        }

        if (record.type === 'new_debt') {
            runningDebt += record.amount;
        } else if (record.type === 'debt_repayment') {
            runningDebt -= record.amount;
        }

        if (record.type === 'income') {
            runningIncome += record.amount;
        }
        if (record.type === 'expense') {
            runningExpense += record.amount;
        }

        return {
            date: record.date,
            balance: runningBalance,
            debt: runningDebt,
            income: runningIncome,
            expense: runningExpense
        };
    });

    // --- Data Grouping ---
    interface DaySummary {
        date: string;
        income: number;
        expense: number;
        net: number;
        records: FinanceRecord[];
    }

    const groupedData = useMemo(() => {
        const groups: {
            [monthKey: string]: {
                monthIncome: number,
                monthExpense: number,
                monthNet: number,
                days: { [dayKey: string]: DaySummary }
            }
        } = {};

        const reversedRecords = [...financeRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        reversedRecords.forEach(record => {
            const monthKey = record.date.substring(0, 7);
            const dayKey = record.date;

            if (!groups[monthKey]) {
                groups[monthKey] = { monthIncome: 0, monthExpense: 0, monthNet: 0, days: {} };
            }

            const monthGroup = groups[monthKey];
            if (!monthGroup.days[dayKey]) {
                monthGroup.days[dayKey] = { date: dayKey, income: 0, expense: 0, net: 0, records: [] };
            }

            const dayGroup = monthGroup.days[dayKey];
            dayGroup.records.push(record);

            if (record.type === 'income' || record.type === 'new_debt') {
                monthGroup.monthIncome += record.amount;
                monthGroup.monthNet += record.amount;
                dayGroup.income += record.amount;
                dayGroup.net += record.amount;
            } else {
                monthGroup.monthExpense += record.amount;
                monthGroup.monthNet -= record.amount;
                dayGroup.expense += record.amount;
                dayGroup.net -= record.amount;
            }
        });
        return groups;
    }, [financeRecords]);

    const sortedMonthKeys = Object.keys(groupedData).sort((a, b) => b.localeCompare(a));

    useMemo(() => {
        if (sortedMonthKeys.length > 0 && expandedMonths.size === 0) {
            setExpandedMonths(new Set([sortedMonthKeys[0]]));
        }
    }, [sortedMonthKeys.length]);

    const toggleMonth = (monthKey: string) => {
        const newSet = new Set(expandedMonths);
        if (newSet.has(monthKey)) newSet.delete(monthKey);
        else newSet.add(monthKey);
        setExpandedMonths(newSet);
    };

    const getTypeLabel = (type: string) => t.table.types[type as keyof typeof t.table.types] || type;

    const formatMonthTitle = (monthKey: string) => {
        if (language === 'zh') {
            const [y, m] = monthKey.split('-');
            return `${y}年 ${m}月`;
        } else {
            const date = new Date(monthKey + '-01');
            return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
    };

    const getDayLabel = (dateStr: string) => {
        const date = new Date(dateStr);
        const day = date.getDate();
        const weekDay = date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' });
        return { day, weekDay };
    };

    return (
        <div className="flex flex-col h-full gap-5 bg-gradient-to-br from-slate-50 to-blue-50/50 p-1 -m-1 rounded-3xl">
            {/* Modals */}
            <DayDetailModal date={selectedDetailDate} onClose={() => setSelectedDetailDate(null)} t={t} getTypeLabel={getTypeLabel} />
            <MonthPickerModal isOpen={showMonthPicker} onClose={() => setShowMonthPicker(false)} onSelect={(d) => setActiveDate(d)} existingMonths={existingMonths} t={t} />
            <DatePickerModal isOpen={showDatePicker} onClose={() => setShowDatePicker(false)} onSelect={(d) => setActiveDate(d)} existingDates={existingDates} t={t} />
            <AddTransactionModal isOpen={showAddTransModal} onClose={() => setShowAddTransModal(false)} onAdd={handleAddTransaction} initialDate={activeDate} t={t} />

            {/* Top Section: KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
                <KPICard title={t.cards.balance} value={`¥${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Wallet} colorClass="text-indigo-600" bgClass="bg-indigo-50" gradient="from-indigo-400 to-purple-500" />
                <KPICard title={t.cards.debt} value={`¥${totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={CreditCard} colorClass="text-rose-600" bgClass="bg-rose-50" gradient="from-rose-400 to-orange-500" />
                <KPICard title={t.cards.income} value={`¥${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} colorClass="text-emerald-600" bgClass="bg-emerald-50" gradient="from-emerald-400 to-teal-500" />
                <KPICard title={t.cards.expense} value={`¥${totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} colorClass="text-slate-600" bgClass="bg-slate-100" gradient="from-slate-400 to-gray-500" />
            </div>

            {/* Middle Section: Charts */}
            <div className="shrink-0 h-auto">
                <FinanceCharts chartData={chartData} t={t} />
            </div>

            {/* Bottom Section: Ledger */}
            <div className="flex-1 bg-white/70 backdrop-blur-xl p-4 md:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 flex flex-col min-h-0 overflow-hidden hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
                            <ArrowRightLeft size={16} />
                        </div>
                        {t.ledgerTitle}
                    </h3>
                    <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                        <button onClick={handleClearData} disabled={financeRecords.length === 0} className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition shadow-sm whitespace-nowrap ${financeRecords.length === 0 ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed' : 'border-rose-200 text-rose-600 bg-white hover:bg-rose-50 hover:border-rose-300'}`}>
                            <Trash2 size={16} className={financeRecords.length === 0 ? "text-slate-300" : "text-rose-500"} /> 清空数据
                        </button>
                        <input 
                            type="file" 
                            accept=".json" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleFileUpload} 
                        />
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white rounded-xl hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600 text-sm font-medium transition shadow-sm whitespace-nowrap">
                            <Upload size={16} className="text-indigo-500" /> {t.actions?.import || '导入 JSON'}
                        </button>
                        <button onClick={openAddTransModal} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-0.5 text-sm font-bold transition whitespace-nowrap">
                            <Plus size={16} /> {t.form.add}
                        </button>
                        <button onClick={() => setShowMonthPicker(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:border-slate-300 text-sm font-medium transition shadow-sm whitespace-nowrap">
                            <Calendar size={16} className="text-indigo-500" /> {t.actions.addMonth}
                        </button>
                        <button onClick={() => setShowDatePicker(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:border-slate-300 text-sm font-medium transition shadow-sm whitespace-nowrap">
                            <Plus size={16} className="text-indigo-500" /> {t.actions.addDate}
                        </button>
                    </div>
                </div>

                {/* Monthly Groups List - Scrollable */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {sortedMonthKeys.map(monthKey => {
                        const group = groupedData[monthKey];
                        const isExpanded = expandedMonths.has(monthKey);
                        const sortedDayKeys = Object.keys(group.days).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

                        return (
                            <div key={monthKey} className="bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
                                {/* Month Header */}
                                <div
                                    onClick={() => toggleMonth(monthKey)}
                                    className={`flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-indigo-50/30 border-b border-indigo-100' : ''}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg transition-transform duration-300 ${isExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-slate-100 text-slate-500'}`}>
                                            <ChevronDown size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-800 text-base flex items-center gap-2">
                                                {formatMonthTitle(monthKey)}
                                            </span>
                                            <span className="text-xs text-slate-400 font-medium">{sortedDayKeys.length} {t.labels.activeDays}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 md:gap-6 text-sm">
                                        <div className="hidden sm:flex flex-col items-end">
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t.monthlyStats.in}</span>
                                            <span className="font-bold text-emerald-600">+¥{group.monthIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="hidden sm:flex flex-col items-end">
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t.monthlyStats.out}</span>
                                            <span className="font-bold text-slate-600">-¥{group.monthExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex flex-col items-end min-w-[60px] md:min-w-[80px]">
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t.monthlyStats.net}</span>
                                            <span className={`font-bold ${group.monthNet >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{group.monthNet >= 0 ? '+' : ''}¥{group.monthNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Day List */}
                                {isExpanded && (
                                    <div className="animate-in slide-in-from-top-2 duration-200 divide-y divide-slate-50">
                                        {sortedDayKeys.map(dayKey => {
                                            const dayData = group.days[dayKey];
                                            const { day, weekDay } = getDayLabel(dayKey);
                                            const isActive = activeDate === dayKey;
                                            return (
                                                <div
                                                    key={dayKey}
                                                    onClick={() => setActiveDate(dayKey)}
                                                    onDoubleClick={() => setSelectedDetailDate(dayKey)}
                                                    className={`group flex items-center p-3 md:p-4 transition cursor-pointer select-none border-l-[3px]
                                                    ${isActive ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'}
                                                `}
                                                    title="Click to set as active date, Double click for details"
                                                >
                                                    <div className="w-14 md:w-20 pl-1 md:pl-2 flex flex-col items-center justify-center border-r border-slate-100 pr-3 md:pr-6 mr-3 md:mr-6">
                                                        <span className={`text-xl md:text-2xl font-bold leading-none ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>{day}</span>
                                                        <span className="text-[10px] text-slate-400 uppercase font-bold mt-1 tracking-wide">{weekDay}</span>
                                                    </div>
                                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-8">
                                                        <div className="flex items-center gap-2 md:gap-3">
                                                            <div className="p-1.5 md:p-2 bg-emerald-100/50 text-emerald-600 rounded-lg"><TrendingUp size={16} /></div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.labels.incomeLabel}</span>
                                                                <span className={`font-bold text-sm md:text-base ${dayData.income > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>+¥{dayData.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 md:gap-3">
                                                            <div className="p-1.5 md:p-2 bg-rose-100/50 text-rose-600 rounded-lg"><TrendingDown size={16} /></div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.labels.expenseLabel}</span>
                                                                <span className={`font-bold text-sm md:text-base ${dayData.expense > 0 ? 'text-slate-700' : 'text-slate-300'}`}>-¥{dayData.expense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="w-24 md:w-40 text-right pr-2 md:pr-4">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.labels.netChange}</span>
                                                            <span className={`font-bold text-sm md:text-lg ${dayData.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{dayData.net > 0 ? '+' : ''}¥{dayData.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </div>
                                                    {isActive && (
                                                        <div className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 text-indigo-200">
                                                            <Check size={20} strokeWidth={3} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {sortedMonthKeys.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Calendar size={32} className="opacity-30" />
                            </div>
                            <p className="font-medium">暂无财务记录</p>
                            <p className="text-sm opacity-60 mt-1">请点击右上角添加第一笔流水</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};