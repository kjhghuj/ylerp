import React from 'react';
import { Card } from '../../../components/ui/card';

interface KPICardProps {
    title: string;
    value: string;
    icon: any; // Using any for simpler integration with Lucide components passed as props
    colorClass: string;
    bgClass: string;
    gradient: string;
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, icon: Icon, colorClass, bgClass, gradient }) => (
    <Card className="relative z-10 flex h-full flex-col justify-between overflow-hidden p-5">
        <div className="flex justify-between items-start z-10">
            <div className="flex flex-col">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
                <h3 className={`text-2xl font-semibold tabular-nums ${colorClass} tracking-tight`}>{value}</h3>
            </div>
            <div className={`p-3 rounded-xl ${bgClass} ${colorClass} shadow-inner`}>
                <Icon size={20} />
            </div>
        </div>
        <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 bg-gradient-to-br ${gradient} blur-xl group-hover:scale-110 transition-transform duration-500`}></div>
    </Card>
);
