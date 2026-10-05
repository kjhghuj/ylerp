import React, { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface TiktokSettingsGroupProps {
    title: string;
    summary: string;
    hasError?: boolean;
    children: React.ReactNode;
}

/** Presentation state stays local; inputs remain mounted while the panel is hidden. */
export const TiktokSettingsGroup: React.FC<TiktokSettingsGroupProps> = ({ title, summary, hasError = false, children }) => {
    const id = useId();
    const [expanded, setExpanded] = useState(hasError);
    useEffect(() => {
        if (hasError) setExpanded(true);
    }, [hasError]);

    return <section className={`min-w-0 rounded-lg border ${hasError ? 'border-rose-200' : 'border-slate-200'}`}>
        <button type="button" id={`${id}-trigger`} aria-label={title}
            data-tiktok-settings-toggle=""
            aria-expanded={expanded} aria-controls={`${id}-panel`} aria-describedby={`${id}-summary`}
            onClick={() => setExpanded(previous => !previous)}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
            <span className="min-w-0 flex-1">
                <span className={`block text-xs font-bold ${hasError ? 'text-rose-700' : 'text-slate-700'}`}>{title}</span>
                <span id={`${id}-summary`} title={summary} className="mt-0.5 text-[10px] leading-4 text-slate-500"
                    style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{summary}</span>
            </span>
            <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`} hidden={!expanded}>
            <div className="border-t border-slate-100 p-3">{children}</div>
        </div>
    </section>;
};
