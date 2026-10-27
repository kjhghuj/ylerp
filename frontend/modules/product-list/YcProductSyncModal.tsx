import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, PackageSearch, Search, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table';

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
    const searchRef = useRef<HTMLInputElement>(null);
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
        <Dialog open onOpenChange={open => { if (!open && !syncing) onClose(); }}>
            <DialogContent
                showCloseButton={false}
                onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }}
                onEscapeKeyDown={event => { if (syncing) event.preventDefault(); }}
                onInteractOutside={event => { if (syncing) event.preventDefault(); }}
                className="flex max-h-[88dvh] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl p-0"
            >
                <div className="flex items-center justify-between border-b border-border p-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-accent p-2.5 text-primary">
                            <PackageSearch size={20} />
                        </div>
                        <div>
                            <DialogTitle className="text-base font-semibold">{labels.title}</DialogTitle>
                            <DialogDescription className="mt-1 text-xs">
                                {labels.subtitle.replace('{site}', siteName)}
                            </DialogDescription>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon"
                        type="button"
                        onClick={onClose}
                        disabled={syncing}
                        aria-label={labels.cancel}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-muted-foreground disabled:opacity-40"
                    >
                        <X size={20} />
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
                    <div className="relative min-w-[220px] flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            type="text"
                            value={searchTerm}
                            onChange={event => setSearchTerm(event.target.value)}
                            placeholder={labels.searchPlaceholder}
                            aria-label={labels.searchPlaceholder}
                            className="pl-9"
                        />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground">
                        <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={toggleAllFiltered}
                            disabled={syncing || selectableItems.length === 0}
                        />
                        {labels.selectAll}
                    </label>
                </div>

                {error && (
                    <div role="alert" className="mx-5 mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div role="status" className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                            {labels.loading}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex min-h-64 flex-col items-center justify-center text-muted-foreground">
                            <PackageSearch size={36} className="mb-3 opacity-30" />
                            <p className="text-sm">{labels.empty}</p>
                        </div>
                    ) : (
                        <Table wrapped={false} className="min-w-[720px] text-left">
                            <TableHeader className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                                <TableRow>
                                    <TableHead className="w-12 p-3" />
                                    <TableHead className="p-3">SKU</TableHead>
                                    <TableHead className="p-3">{labels.productName}</TableHead>
                                    <TableHead className="p-3 text-right">{labels.available}</TableHead>
                                    <TableHead className="p-3 text-right">{labels.inventory}</TableHead>
                                    <TableHead className="p-3">{labels.warehouse}</TableHead>
                                    <TableHead className="p-3" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredItems.map(item => {
                                    const disabled = item.alreadyInCurrentSite;
                                    const selected = selectedSkus.has(item.sku);
                                    return (
                                        <TableRow
                                            key={item.sku}
                                            className={disabled ? 'bg-muted/50 text-muted-foreground' : ''}
                                        >
                                            <TableCell className="p-3 text-center">
                                                <Checkbox
                                                    aria-label={`选择 ${item.sku}`}
                                                    checked={selected}
                                                    disabled={disabled || syncing}
                                                    onCheckedChange={() => toggleSku(item.sku)}
                                                />
                                            </TableCell>
                                            <TableCell className="p-3 font-mono text-xs font-medium">{item.sku}</TableCell>
                                            <TableCell className="p-3 font-medium">{item.name}</TableCell>
                                            <TableCell className="p-3 text-right tabular-nums">{item.available}</TableCell>
                                            <TableCell className="p-3 text-right tabular-nums">{item.inventory}</TableCell>
                                            <TableCell className="p-3 text-xs">{item.warehouseCodes.join(', ') || '-'}</TableCell>
                                            <TableCell className="p-3 text-right">
                                                {disabled && (
                                                    <Badge variant="secondary" className="gap-1 whitespace-nowrap">
                                                        <Check size={11} /> {labels.alreadySynced}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/50 px-5 py-4">
                    <span className="text-sm text-muted-foreground">
                        {labels.selectedCount.replace('{count}', String(selectedSkus.size))}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline"
                            type="button"
                            onClick={onClose}
                            disabled={syncing}
                        >
                            {labels.cancel}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => onSync(Array.from(selectedSkus))}
                            disabled={selectedSkus.size === 0 || loading || syncing}
                        >
                            {syncing ? labels.syncing : labels.confirm}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
