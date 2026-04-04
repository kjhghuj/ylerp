import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpTooltipProps {
    title: string;
    content: string;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setIsOpen(true); } }}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-300 hover:text-brand-500 hover:bg-brand-50 transition-colors cursor-pointer"
            >
                <HelpCircle size={14} />
            </span>

            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-brand-500 to-brand-600">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <HelpCircle size={16} />
                                {title}
                            </h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{content}</p>
                        </div>
                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="px-4 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition-colors"
                            >
                                知道了
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default HelpTooltip;
