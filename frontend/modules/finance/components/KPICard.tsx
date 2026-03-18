import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string;
    icon: any; // Using any for simpler integration with Lucide components passed as props
    colorClass: string;
    bgClass: string;
    gradient: string;
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, icon: Icon, colorClass, bgClass, gradient }) => (
    <div className={`p-5 rounded-3xl border border-white/50 bg-white/70 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group h-full flex flex-col justify-between z-10`}>
        <div className="flex justify-between items-start z-10">
            <div className="flex flex-col">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
                <h3 className={`text-2xl font-bold ${colorClass} tracking-tight`}>{value}</h3>
            </div>
            <div className={`p-3 rounded-xl ${bgClass} ${colorClass} shadow-inner`}>
                <Icon size={20} />
            </div>
        </div>
        <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 bg-gradient-to-br ${gradient} blur-xl group-hover:scale-110 transition-transform duration-500`}></div>
    </div>
);
