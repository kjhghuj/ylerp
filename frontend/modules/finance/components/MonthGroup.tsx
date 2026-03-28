import React from 'react';
import { Trash2, ChevronDown } from 'lucide-react';

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
    records: any[];
}

interface MonthGroupData {
    monthIncome: number;
    monthExpense: number;
    monthNewDebt: number;
    monthRepayment: number;
    monthNet: number;
    monthDebtBalance: number;
    monthAccountBalance: number;
    days: { [dayKey: string]: DaySummary };
}

interface MonthGroupProps {
    monthKey: string;
    group: MonthGroupData;
    isExpanded: boolean;
    onToggle: () => void;
    activeDate: string;
    onDateSelect: (date: string) => void;
    onDateDetail: (date: string) => void;
    onDeleteMonth: () => void;
    formatMonthTitle: (key: string) => string;
    getDayLabel: (dateStr: string) => { day: number; weekDay: string };
    t: any;
    activeDaysLabel: string;
    dayCount: number;
}

export const MonthGroup: React.FC<MonthGroupProps> = ({
    monthKey, group, isExpanded, onToggle, activeDate, onDateSelect, onDateDetail,
    onDeleteMonth, formatMonthTitle, getDayLabel, t, activeDaysLabel, dayCount
}) => {
    const sortedDayKeys = Object.keys(group.days).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
            <div onClick={onToggle} className={`flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-indigo-50/30 border-b border-indigo-100' : ''}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg transition-transform duration-300 ${isExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-slate-100 text-slate-500'}`}>
                        <ChevronDown size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-base">{formatMonthTitle(monthKey)}</span>
                        <span className="text-xs text-slate-400 font-medium">{dayCount} {activeDaysLabel}</span>
                    </div>
                </div>
                <div className="flex gap-2 md:gap-6 text-sm">
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t.monthlyStats.in}</span>
                        <span className="font-bold text-emerald-600">+¥{fmt(group.monthIncome)}</span>
                        {group.monthNewDebt > 0 && <span className="text-[10px] text-amber-600 font-bold mt-0.5">借入 +¥{fmt(group.monthNewDebt)}</span>}
                    </div>
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t.monthlyStats.out}</span>
                        <span className="font-bold text-slate-600">-¥{fmt(group.monthExpense)}</span>
                        {group.monthRepayment > 0 && <span className="text-[10px] text-indigo-500 font-bold mt-0.5">还款 -¥{fmt(group.monthRepayment)}</span>}
                    </div>
                    <div className="flex flex-col items-end min-w-[60px] md:min-w-[80px]">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t.monthlyStats.net}</span>
                        <span className={`font-bold ${group.monthNet >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{group.monthNet >= 0 ? '+' : ''}¥{fmt(group.monthNet)}</span>
                    </div>
                    <div className="border-l border-slate-200 pl-2 md:pl-4 ml-1 md:ml-2 flex items-center">
                        <button onClick={(e) => { e.stopPropagation(); onDeleteMonth(); }} className="p-1.5 md:p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition" title="删除该月所有流水">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="animate-in slide-in-from-top-2 duration-200 overflow-x-auto custom-scrollbar bg-slate-50/30">
                    <table className="w-full text-sm text-left whitespace-nowrap min-w-[900px]">
                        <thead className="text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                                <th className="py-3 pl-6">日期 (日)</th>
                                <th className="py-3 text-right pr-4">资金余额</th>
                                <th className="py-3 text-right pr-4">营业收入</th>
                                <th className="py-3 text-right pr-4">新增借入</th>
                                <th className="py-3 text-right pr-4">债务偿还</th>
                                <th className="py-3 text-right pr-4">累计负债</th>
                                <th className="py-3 text-right pr-4">房租水电</th>
                                <th className="py-3 text-right pr-4">物流运费</th>
                                <th className="py-3 text-right pr-4">人工薪资</th>
                                <th className="py-3 text-right pr-4">其他收支</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedDayKeys.map(dayKey => {
                                const dayData = group.days[dayKey];
                                const { day } = getDayLabel(dayKey);
                                const isActive = activeDate === dayKey;
                                return (
                                    <tr key={dayKey} onClick={() => onDateSelect(dayKey)} onDoubleClick={() => onDateDetail(dayKey)}
                                        className={`group hover:bg-white cursor-pointer transition-colors ${isActive ? 'bg-white shadow-[inset_3px_0_0_#4f46e5]' : ''}`}
                                        title="双击查看明细">
                                        <td className={`py-4 pl-6 font-bold ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>{day}日</td>
                                        <td className="py-4 text-right pr-4 font-bold text-slate-800">{dayData.accountBalance > 0 ? `¥${dayData.accountBalance.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-emerald-600">{dayData.expectedIncome > 0 ? `+¥${dayData.expectedIncome.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-amber-600">{dayData.newDebt > 0 ? `+¥${dayData.newDebt.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-indigo-500">{dayData.repayment > 0 ? `-¥${dayData.repayment.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-bold text-slate-800">{dayData.debtBalance > 0 ? `¥${dayData.debtBalance.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-slate-600">{dayData.rentUtilities > 0 ? `-¥${dayData.rentUtilities.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-slate-600">{dayData.freightCost > 0 ? `-¥${dayData.freightCost.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-slate-600">{dayData.salary > 0 ? `-¥${dayData.salary.toLocaleString()}` : '-'}</td>
                                        <td className="py-4 text-right pr-4 font-medium text-slate-500">
                                            {(dayData.otherIncome > 0 || dayData.otherExpense > 0) ? `+${dayData.otherIncome} / -${dayData.otherExpense}` : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
