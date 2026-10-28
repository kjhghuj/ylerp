import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface FinanceChartsProps {
    chartData: any[];
    t: any;
}

export const FinanceCharts: React.FC<FinanceChartsProps> = ({ chartData, t }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
            <div className="bg-card p-5 rounded-xl shadow-sm transition-all duration-300 border border-border/50 flex flex-col relative z-10">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                    {t.balance} & {t.debt}
                </h3>
                <div className="w-full">
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--ui-primary))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--ui-primary))" stopOpacity={0} /></linearGradient>
                                <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--ui-danger))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--ui-danger))" stopOpacity={0} /></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--ui-border))" />
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={(tick) => {
                                    const date = new Date(tick);
                                    return `${date.getMonth() + 1}/${date.getDate()}`;
                                }} 
                                tick={{ fontSize: 10, fill: 'hsl(var(--ui-muted-foreground))' }} 
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <YAxis tickFormatter={(val) => `¥${val.toFixed(2)}`} tick={{ fontSize: 10, fill: 'hsl(var(--ui-muted-foreground))' }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: number) => `¥${value.toFixed(2)}`} labelFormatter={(label) => new Date(label).toLocaleDateString()} contentStyle={{ background: 'hsl(var(--ui-card))', color: 'hsl(var(--ui-card-foreground))', borderRadius: 'var(--ui-radius)', border: '1px solid hsl(var(--ui-border))', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                            <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                            <Area type="monotone" dataKey="balance" name={t.balance} stroke="hsl(var(--ui-primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
                            <Area type="monotone" dataKey="debt" name={t.debt} stroke="hsl(var(--ui-danger))" strokeWidth={2} fillOpacity={1} fill="url(#colorDebt)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-card p-5 rounded-xl shadow-sm transition-all duration-300 border border-border/50 flex flex-col relative z-10">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                    {t.cards.income} & {t.cards.expense}
                </h3>
                <div className="w-full">
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--ui-success))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--ui-success))" stopOpacity={0} /></linearGradient>
                                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--ui-muted-foreground))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--ui-muted-foreground))" stopOpacity={0} /></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--ui-border))" />
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={(tick) => {
                                    const date = new Date(tick);
                                    return `${date.getMonth() + 1}/${date.getDate()}`;
                                }}
                                tick={{ fontSize: 10, fill: 'hsl(var(--ui-muted-foreground))' }} 
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <YAxis tickFormatter={(val) => `¥${val.toFixed(2)}`} tick={{ fontSize: 10, fill: 'hsl(var(--ui-muted-foreground))' }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: number) => `¥${value.toFixed(2)}`} labelFormatter={(label) => new Date(label).toLocaleDateString()} contentStyle={{ background: 'hsl(var(--ui-card))', color: 'hsl(var(--ui-card-foreground))', borderRadius: 'var(--ui-radius)', border: '1px solid hsl(var(--ui-border))', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                            <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                            <Area type="monotone" dataKey="income" name={t.cards.income} stroke="hsl(var(--ui-success))" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                            <Area type="monotone" dataKey="expense" name={t.cards.expense} stroke="hsl(var(--ui-muted-foreground))" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
