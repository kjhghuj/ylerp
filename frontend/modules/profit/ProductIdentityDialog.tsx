import React, { useEffect, useId, useRef } from 'react';
import type { translations } from '../../translations';
import type { ProductIdentityConfirmation } from './useProductActions';

interface Props {
    confirmation: ProductIdentityConfirmation;
    strings: typeof translations.zh.profit.saveIdentity;
    onUpdate: () => void;
    onSaveAsNew: () => void;
    onCancel: () => void;
}

export const ProductIdentityDialog = ({ confirmation, strings, onUpdate, onSaveAsNew, onCancel }: Props) => {
    const titleId = useId();
    const descriptionId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        cancelRef.current?.focus();
        return () => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
                className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
                onKeyDown={event => {
                    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
                    if (event.key !== 'Tab') return;
                    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
                    const first = buttons[0];
                    const last = buttons[buttons.length - 1];
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                }}>
                <h3 id={titleId} className="text-lg font-bold text-slate-800">{strings.title}</h3>
                <p id={descriptionId} className="mt-2 text-sm text-slate-600">{strings.description}</p>
                <dl className="my-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm break-words">
                    <div><dt className="text-slate-500">{strings.original}</dt>
                        <dd className="font-semibold">{confirmation.originalName} · {confirmation.originalSku}</dd></div>
                    <div><dt className="text-slate-500">{strings.current}</dt>
                        <dd className="font-semibold">{confirmation.name} · {confirmation.sku}</dd></div>
                </dl>
                <div className="flex flex-wrap justify-end gap-2">
                    <button ref={cancelRef} type="button" onClick={onCancel}
                        className="rounded-lg border px-3 py-2 text-sm text-slate-600">{strings.cancel}</button>
                    <button type="button" onClick={onUpdate}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{strings.confirmUpdate}</button>
                    <button type="button" onClick={onSaveAsNew}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">{strings.saveAsNew}</button>
                </div>
            </div>
        </div>
    );
};
