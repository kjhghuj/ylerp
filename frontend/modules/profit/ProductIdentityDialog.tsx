import React, { useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
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
    const cancelRef = useRef<HTMLButtonElement>(null);
    return <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
        <DialogContent showCloseButton={false} className="w-[calc(100%-2rem)] rounded-xl"
            onOpenAutoFocus={event => { event.preventDefault(); cancelRef.current?.focus(); }}>
            <DialogTitle>{strings.title}</DialogTitle>
            <DialogDescription>{strings.description}</DialogDescription>
            <dl className="space-y-3 rounded-lg bg-muted p-4 text-sm break-words">
                <div><dt className="text-muted-foreground">{strings.original}</dt><dd className="font-semibold">{confirmation.originalName} · {confirmation.originalSku}</dd></div>
                <div><dt className="text-muted-foreground">{strings.current}</dt><dd className="font-semibold">{confirmation.name} · {confirmation.sku}</dd></div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
                <Button ref={cancelRef} variant="outline" onClick={onCancel}>{strings.cancel}</Button>
                <Button variant="outline" className="border-warning/30 bg-warning-subtle text-warning" onClick={onUpdate}>{strings.confirmUpdate}</Button>
                <Button onClick={onSaveAsNew}>{strings.saveAsNew}</Button>
            </div>
        </DialogContent>
    </Dialog>;
};
