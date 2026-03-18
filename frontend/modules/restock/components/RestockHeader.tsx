import React from 'react';
import { Package, Settings, Calendar } from 'lucide-react';

interface RestockHeaderProps {
    leadTime: number;
    setLeadTime: (val: number) => void;
    targetDate: string;
    setTargetDate: (val: string) => void;
    showMapping: boolean;
    setShowMapping: (val: boolean) => void;
    t: any;
}

export const RestockHeader: React.FC<RestockHeaderProps> = ({
    leadTime, setLeadTime, targetDate, setTargetDate, showMapping, setShowMapping, t
}) => {
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white/70 backdrop-blur-xl p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 gap-4 relative z-10">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Package className="text-blue-600" /> {t.title}
                </h2>
                <p className="text-slate-500 text-sm">{t.subtitle}</p>
            </div>

            <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {/* Lead Time Setting */}
                    <div className="flex items-center gap-2">
                        <Settings size={18} className="text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{t.settings.leadTime}</span>
                        <input
                            type="number"
                            value={leadTime}
                            onChange={(e) => setLeadTime(parseInt(e.target.value))}
                            className="w-12 p-1 border rounded text-center text-xs"
                        />
                    </div>

                    <div className="w-px h-6 bg-slate-200"></div>

                    {/* Target Date Setting */}
                    <div className="flex items-center gap-2">
                        <Calendar size={18} className="text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{t.settings.targetDate}</span>
                        <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            className="p-1 border rounded text-xs text-slate-700 bg-white"
                        />
                    </div>
                </div>

                <button
                    onClick={() => setShowMapping(!showMapping)}
                    className="text-xs font-bold text-slate-600 underline hover:text-blue-600"
                >
                    {showMapping ? t.messages.hideMappings : t.messages.manageMappings}
                </button>
            </div>
        </div>
    );
};
