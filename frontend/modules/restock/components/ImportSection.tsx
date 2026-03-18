import React from 'react';
import { Upload } from 'lucide-react';

interface ImportSectionProps {
    handleFileClick: (type: 'sales' | 'sales7' | 'official' | 'third') => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    processFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
    t: any;
}

export const ImportSection: React.FC<ImportSectionProps> = ({ handleFileClick, fileInputRef, processFile, t }) => {
    return (
        <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 relative z-10">
            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={processFile} />
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Upload size={16} /> {t.imports.title}
            </h3>
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={() => handleFileClick('sales')}
                    className="px-4 py-2 rounded-lg bg-emerald-100 text-emerald-800 text-sm font-semibold hover:bg-emerald-200 transition flex items-center gap-2"
                >
                    <Upload size={14} /> {t.imports.salesBtn}
                </button>
                <button
                    onClick={() => handleFileClick('sales7')}
                    className="px-4 py-2 rounded-lg bg-violet-100 text-violet-800 text-sm font-semibold hover:bg-violet-200 transition flex items-center gap-2"
                >
                    <Upload size={14} /> {t.imports.sales7Btn}
                </button>
                <button
                    onClick={() => handleFileClick('official')}
                    className="px-4 py-2 rounded-lg bg-orange-100 text-orange-800 text-sm font-semibold hover:bg-orange-200 transition flex items-center gap-2"
                >
                    <Upload size={14} /> {t.imports.officialBtn}
                </button>
                <button
                    onClick={() => handleFileClick('third')}
                    className="px-4 py-2 rounded-lg bg-sky-100 text-sky-800 text-sm font-semibold hover:bg-sky-200 transition flex items-center gap-2"
                >
                    <Upload size={14} /> {t.imports.thirdBtn}
                </button>
            </div>
        </div>
    );
};
