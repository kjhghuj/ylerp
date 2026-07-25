import React, { useEffect, useMemo, useState } from 'react';
import { Check, PackageSearch, Search, X } from 'lucide-react';

export interface YcProductSyncItem {
    sku: string;
    name: string;
    warehouseCodes: string[];
    available: number;
    inventory: number;
    occupy: number;
    unshipped: number;
    alreadyInCurrentSite: boolean;
}

interface YcProductSyncLabels {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    productName: string;
    selectAll: string;
    selectedCount: string;
    alreadySynced: string;
    available: string;
    inventory: string;
    warehouse: string;
    empty: string;
    loading: string;
    cancel: string;
    confirm: string;
    syncing: string;
}

interface YcProductSyncModalProps {
    siteName: string;
    items: YcProductSyncItem[];
    labels: YcProductSyncLabels;
    loading: boolean;
    syncing: boolean;
    error: string | null;
    onClose: () => void;
    onSync: (skus: string[]) => void;
}

export const YcProductSyncModal: React.FC<YcProductSyncModalProps> = ({
    siteName,
    items,
    labels,
    loading,
    syncing,
    error,
    onClose,
    onSync,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return items;
        return items.filter(item => (
            item.sku.toLowerCase().includes(query)
            || item.name.toLowerCase().includes(query)
        ));
    }, [items, searchTerm]);
    const selectableItems = filteredItems.filter(item => !item.alreadyInCurrentSite);
    const allFilteredSelected = selectableItems.length > 0
        && selectableItems.every(item => selectedSkus.has(item.sku));

    useEffect(() => {
        setSelectedSkus(previous => {
            const available = new Set(
                items.filter(item => !item.alreadyInCurrentSite).map(item => item.sku),
            );
            return new Set(Array.from(previous).filter(sku => available.has(sku)));
        });
    }, [items]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !syncing) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, syncing]);

    const toggleSku = (sku: string) => {
        setSelectedSkus(previous => {
            const next = new Set(previous);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const toggleAllFiltered = () => {
        setSelectedSkus(previous => {
            const next = new Set(previous);
            if (allFilteredSelected) {
                selectableItems.forEach(item => next.delete(item.sku));
            } else {
                selectableItems.forEach(item => next.add(item.sku));
            }
            return next;
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="yc-sync-title"
                className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
                <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 to-white p-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-600">
                            <PackageSearch size={20} />
                        </div>
                        <div>
                            <h3 id="yc-sync-title" className="font-bold text-slate-800">{labels.title}</h3>
                            <p className="text-xs text-slate-500">
                                {labels.subtitle.replace('{site}', siteName)}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={syncing}
                        aria-label={labels.cancel}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                    <div className="relative min-w-[220px] flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            autoFocus
                            type="text"
                            value={searchTerm}
                            onChange={event => setSearchTerm(event.target.value)}
                            placeholder={labels.searchPlaceholder}
                            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
                        <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={toggleAllFiltered}
                            disabled={selectableItems.length === 0}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {labels.selectAll}
                    </label>
                </div>

                {error && (
                    <div className="mx-5 mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex min-h-64 items-center justify-center text-sm text-slate-400">
                            {labels.loading}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex min-h-64 flex-col items-center justify-center text-slate-400">
                            <PackageSearch size={36} className="mb-3 opacity-30" />
                            <p className="text-sm">{labels.empty}</p>
                        </div>
                    ) : (
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="w-12 p-3" />
                                    <th className="p-3">SKU</th>
                                    <th className="p-3">{labels.productName}</th>
                                    <th className="p-3 text-right">{labels.available}</th>
                                    <th className="p-3 text-right">{labels.inventory}</th>
                                    <th className="p-3">{labels.warehouse}</th>
                                    <th className="p-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredItems.map(item => {
                                    const disabled = item.alreadyInCurrentSite;
                                    const selected = selectedSkus.has(item.sku);
                                    return (
                                        <tr
                                            key={item.sku}
                                            className={disabled ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-indigo-50/30'}
                                        >
                                            <td className="p-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`选择 ${item.sku}`}
                                                    checked={selected}
                                                    disabled={disabled || syncing}
                                                    onChange={() => toggleSku(item.sku)}
                                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                            </td>
                                            <td className="p-3 font-mono text-xs font-bold">{item.sku}</td>
                                            <td className="p-3 font-medium text-slate-700">{item.name}</td>
                                            <td className="p-3 text-right font-mono">{item.available}</td>
                                            <td className="p-3 text-right font-mono">{item.inventory}</td>
                                            <td className="p-3 text-xs">{item.warehouseCodes.join(', ') || '-'}</td>
                                            <td className="p-3 text-right">
                                                {disabled && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-600">
                                                        <Check size={11} /> {labels.alreadySynced}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                    <span className="text-sm text-slate-500">
                        {labels.selectedCount.replace('{count}', String(selectedSkus.size))}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={syncing}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                        >
                            {labels.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSync(Array.from(selectedSkus))}
                            disabled={selectedSkus.size === 0 || loading || syncing}
                            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {syncing ? labels.syncing : labels.confirm}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
