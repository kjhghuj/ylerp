import { Button } from '../../../components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table';
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
        <div className="bg-card/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-border/60 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
            <div onClick={onToggle} className={`flex items-center justify-between p-4 cursor-pointer hover:bg-muted transition-colors ${isExpanded ? 'bg-accent/30 border-b border-indigo-100' : ''}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg transition-transform duration-300 ${isExpanded ? 'bg-accent text-primary rotate-180' : 'bg-muted text-muted-foreground'}`}>
                        <ChevronDown size={16} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-foreground text-base">{formatMonthTitle(monthKey)}</span>
                        <span className="text-xs text-muted-foreground font-medium">{dayCount} {activeDaysLabel}</span>
                    </div>
                </div>
                <div className="flex gap-2 md:gap-6 text-sm">
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.monthlyStats.in}</span>
                        <span className="font-bold text-success">+¥{fmt(group.monthIncome)}</span>
                        {group.monthNewDebt > 0 && <span className="text-[10px] text-warning font-bold mt-0.5">借入 +¥{fmt(group.monthNewDebt)}</span>}
                    </div>
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.monthlyStats.out}</span>
                        <span className="font-bold text-muted-foreground">-¥{fmt(group.monthExpense)}</span>
                        {group.monthRepayment > 0 && <span className="text-[10px] text-primary font-bold mt-0.5">还款 -¥{fmt(group.monthRepayment)}</span>}
                    </div>
                    <div className="flex flex-col items-end min-w-[60px] md:min-w-[80px]">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.monthlyStats.net}</span>
                        <span className={`font-bold ${group.monthNet >= 0 ? 'text-primary' : 'text-danger'}`}>{group.monthNet >= 0 ? '+' : ''}¥{fmt(group.monthNet)}</span>
                    </div>
                    <div className="border-l border-border pl-2 md:pl-4 ml-1 md:ml-2 flex items-center">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDeleteMonth(); }} className="p-1.5 md:p-2 text-muted-foreground hover:text-rose-500 hover:bg-destructive/10 rounded-xl transition" title="删除该月所有流水">
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="animate-in slide-in-from-top-2 duration-200 overflow-x-auto custom-scrollbar bg-muted/30">
                    <Table wrapped={false} className="w-full text-sm text-left whitespace-nowrap min-w-[1000px]">
                        <TableHeader className="text-muted-foreground font-bold border-b border-border text-xs uppercase tracking-wider">
                            <TableRow>
                                <TableHead className="py-3 pl-6 pr-2 w-16">日期</TableHead>
                                <TableHead className="py-3 pr-6 w-28 text-right">资金余额</TableHead>
                                <TableHead className="py-3 pr-6 w-28 text-right border-l border-border pl-4">营业收入</TableHead>
                                <TableHead className="py-3 pr-6 w-24 text-right">新增借入</TableHead>
                                <TableHead className="py-3 pr-6 w-24 text-right">债务偿还</TableHead>
                                <TableHead className="py-3 pr-6 w-28 text-right">累计负债</TableHead>
                                <TableHead className="py-3 pr-6 w-24 text-right border-l border-border pl-4">房租水电</TableHead>
                                <TableHead className="py-3 pr-6 w-24 text-right">物流运费</TableHead>
                                <TableHead className="py-3 pr-6 w-24 text-right">人工薪资</TableHead>
                                <TableHead className="py-3 pr-6 w-28 text-right border-l border-border pl-4">其他收支</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {sortedDayKeys.map(dayKey => {
                                const dayData = group.days[dayKey];
                                const { day } = getDayLabel(dayKey);
                                const isActive = activeDate === dayKey;
                                return (
                                    <TableRow key={dayKey} onClick={() => onDateSelect(dayKey)} onDoubleClick={() => onDateDetail(dayKey)}
                                        className={`group hover:bg-card cursor-pointer transition-colors ${isActive ? 'bg-card shadow-[inset_3px_0_0_#4f46e5]' : ''}`}
                                        title="双击查看明细">
                                        <TableCell className={`py-3.5 pl-6 pr-2 font-bold ${isActive ? 'text-primary' : 'text-foreground'}`}>{day}日</TableCell>
                                        <TableCell className={`py-3.5 pr-6 text-right font-bold ${dayData.accountBalance >= 0 ? 'text-primary' : 'text-danger'}`}>¥{dayData.accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-success border-l border-border pl-4">{dayData.expectedIncome > 0 ? `+¥${dayData.expectedIncome.toLocaleString()}` : '-'}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-warning">{dayData.newDebt > 0 ? `+¥${dayData.newDebt.toLocaleString()}` : '-'}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-primary">{dayData.repayment > 0 ? `-¥${dayData.repayment.toLocaleString()}` : '-'}</TableCell>
                                        <TableCell className={`py-3.5 pr-6 text-right font-bold ${dayData.debtBalance >= 0 ? 'text-foreground' : 'text-success'}`}>{dayData.debtBalance !== 0 ? `¥${dayData.debtBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-muted-foreground border-l border-border pl-4">{dayData.rentUtilities > 0 ? `-¥${dayData.rentUtilities.toLocaleString()}` : '-'}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-muted-foreground">{dayData.freightCost > 0 ? `-¥${dayData.freightCost.toLocaleString()}` : '-'}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-muted-foreground">{dayData.salary > 0 ? `-¥${dayData.salary.toLocaleString()}` : '-'}</TableCell>
                                        <TableCell className="py-3.5 pr-6 text-right font-medium text-muted-foreground border-l border-border pl-4">
                                            {(dayData.otherIncome > 0 || dayData.otherExpense > 0) ? `+${dayData.otherIncome} / -${dayData.otherExpense}` : '-'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
};
