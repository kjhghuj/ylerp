import React, { useState, useMemo } from 'react';
import { useStore } from '../StoreContext';
import {
    Plus, Calendar,
    TrendingUp, TrendingDown, CreditCard,
    Check, Wallet, ArrowRightLeft, Upload, Trash2
} from 'lucide-react';
import { FinanceRecord } from '../types';
import { KPICard } from './finance/components/KPICard';
import { FinanceCharts } from './finance/components/FinanceCharts';
import { MonthPickerModal } from './finance/modals/MonthPickerModal';
import { DatePickerModal } from './finance/modals/DatePickerModal';
import { AddTransactionModal } from './finance/modals/AddTransactionModal';
import { DayDetailModal } from './finance/modals/DayDetailModal';
import { MonthGroup } from './finance/components/MonthGroup';

export const FinanceManager: React.FC = () => {
    const { financeRecords, addTransaction, importTransactions, clearAllTransactions, accountBalance, totalDebt, strings, language, deleteTransactionsByMonth } = useStore();
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
    const handleAddTransaction = (data: Omit<FinanceRecord, 'id' | 'accountId'>) => {
        addTransaction({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            ...data,
            accountId: 'main'
        });

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
            .filter(r => r.type === 'expense' || r.type === 'debt_repayment')
            .reduce((sum, r) => sum + r.amount, 0);
    }, [financeRecords]);

    // --- Data Processing for Chart ---
    const sortedRecords = [...financeRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    let runningDebt = 0;
    let runningIncome = 0;
    let runningExpense = 0;

    const chartData = sortedRecords.map(record => {
        if (record.type === 'income') {
            runningBalance += record.amount;
        } else if (record.type === 'expense' || record.type === 'debt_repayment') {
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
        if (record.type === 'expense' || record.type === 'debt_repayment') {
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
        expectedIncome: number;
        newDebt: number;
        repayment: number;
        debtBalance: number;
        accountBalance: number;
        rentUtilities: number;
        freightCost: number;
        salary: number;
        otherIncome: number;
        otherExpense: number;
        net: number;
        records: FinanceRecord[];
    }

    const groupedData = useMemo(() => {
        const groups: {
            [monthKey: string]: {
                monthIncome: number,
                monthExpense: number,
                monthNewDebt: number,
                monthRepayment: number,
                monthNet: number,
                monthDebtBalance: number,
                monthAccountBalance: number,
                totalExpectedIncome: number,
                totalRentUtilities: number,
                totalFreightCost: number,
                totalSalary: number,
                totalOtherIncome: number,
                totalOtherExpense: number,
                days: { [dayKey: string]: DaySummary }
            }
        } = {};

        const reversedRecords = [...financeRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        reversedRecords.forEach(record => {
            const monthKey = record.date.substring(0, 7);
            const dayKey = record.date;

            if (!groups[monthKey]) {
                groups[monthKey] = { 
                    monthIncome: 0, monthExpense: 0, monthNewDebt: 0, monthRepayment: 0, monthNet: 0, monthDebtBalance: 0, monthAccountBalance: 0,
                    totalExpectedIncome: 0, totalRentUtilities: 0, totalFreightCost: 0, totalSalary: 0, totalOtherIncome: 0, totalOtherExpense: 0,
                    days: {} 
                };
            }

            const monthGroup = groups[monthKey];
            if (!monthGroup.days[dayKey]) {
                monthGroup.days[dayKey] = { 
                    date: dayKey, expectedIncome: 0, newDebt: 0, repayment: 0, debtBalance: 0, accountBalance: 0, rentUtilities: 0, freightCost: 0, salary: 0, otherIncome: 0, otherExpense: 0, net: 0, records: [] 
                };
            }

            const dayGroup = monthGroup.days[dayKey];
            dayGroup.records.push(record);

            if (record.type === 'income') {
                if (record.category === 'Revenue') {
                    dayGroup.expectedIncome += record.amount;
                    monthGroup.totalExpectedIncome += record.amount;
                } else {
                    dayGroup.otherIncome += record.amount;
                    monthGroup.totalOtherIncome += record.amount;
                }
                monthGroup.monthIncome += record.amount;
                monthGroup.monthNet += record.amount;
                dayGroup.net += record.amount;
            } else if (record.type === 'expense') {
                if (record.category === 'Operations') {
                    dayGroup.rentUtilities += record.amount;
                    monthGroup.totalRentUtilities += record.amount;
                } else if (record.category === 'Logistics') {
                    dayGroup.freightCost += record.amount;
                    monthGroup.totalFreightCost += record.amount;
                } else if (record.category === 'HR') {
                    dayGroup.salary += record.amount;
                    monthGroup.totalSalary += record.amount;
                } else {
                    dayGroup.otherExpense += record.amount;
                    monthGroup.totalOtherExpense += record.amount;
                }
                monthGroup.monthExpense += record.amount;
                monthGroup.monthNet -= record.amount;
                dayGroup.net -= record.amount;
            } else if (record.type === 'new_debt') {
                monthGroup.monthNewDebt += record.amount;
                dayGroup.newDebt += record.amount;
            } else if (record.type === 'debt_repayment') {
                monthGroup.monthRepayment += record.amount;
                dayGroup.repayment += record.amount;
            } else if (record.type === 'debt_balance') {
                dayGroup.debtBalance += record.amount;
                if (!monthGroup.monthDebtBalance) monthGroup.monthDebtBalance = record.amount;
            }
        });

        const allDays: { date: string; expectedIncome: number; newDebt: number; repayment: number; rentUtilities: number; freightCost: number; salary: number }[] = [];
        Object.values(groups).forEach(g => {
            Object.entries(g.days).forEach(([dateStr, day]) => {
                allDays.push({
                    date: dateStr,
                    expectedIncome: day.expectedIncome,
                    newDebt: day.newDebt,
                    repayment: day.repayment,
                    rentUtilities: day.rentUtilities,
                    freightCost: day.freightCost,
                    salary: day.salary,
                });
            });
        });
        allDays.sort((a, b) => a.date.localeCompare(b.date));

        let runningBalance = 0;
        let runningDebtBalance = 0;
        allDays.forEach(day => {
            const dailyNet = day.expectedIncome - day.repayment - day.rentUtilities - day.freightCost - day.salary;
            runningBalance += dailyNet;
            runningDebtBalance += day.newDebt - day.repayment;
            const monthKey = day.date.substring(0, 7);
            if (groups[monthKey]?.days[day.date]) {
                groups[monthKey].days[day.date].accountBalance = runningBalance;
                groups[monthKey].monthAccountBalance = runningBalance;
                groups[monthKey].days[day.date].debtBalance = runningDebtBalance;
                groups[monthKey].monthDebtBalance = runningDebtBalance;
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
            <DayDetailModal date={selectedDetailDate} onClose={() => setSelectedDetailDate(null)} t={t} />
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
                        return (
                            <MonthGroup
                                key={monthKey}
                                monthKey={monthKey}
                                group={group}
                                isExpanded={expandedMonths.has(monthKey)}
                                onToggle={() => toggleMonth(monthKey)}
                                activeDate={activeDate}
                                onDateSelect={setActiveDate}
                                onDateDetail={setSelectedDetailDate}
                                onDeleteMonth={() => {
                                    if (window.confirm(`确定要删除 ${formatMonthTitle(monthKey)} 的所有流水数据吗？`)) {
                                        deleteTransactionsByMonth(monthKey);
                                    }
                                }}
                                formatMonthTitle={formatMonthTitle}
                                getDayLabel={getDayLabel}
                                t={t}
                                activeDaysLabel={t.labels.activeDays}
                                dayCount={Object.keys(group.days).length}
                            />
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