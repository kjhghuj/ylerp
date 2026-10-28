import { Button } from '../../components/ui/button';
import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { PlatformNode } from './types';

interface InvalidTemplateCardProps {
    node: PlatformNode;
    onDelete: (id: string) => void;
}

export const InvalidTemplateCard: React.FC<InvalidTemplateCardProps> = ({
    node,
    onDelete,
}) => {
    const schemaVersion = node.persistedData?.kind === 'invalid'
        ? node.persistedData.schemaVersion
        : undefined;

    return (
        <div
            role="status"
            className="min-w-0 w-full border-2 border-amber-300 rounded-xl bg-card shadow-sm flex flex-col overflow-hidden"
        >
            <div className="bg-warning-subtle px-4 py-3 flex items-center justify-between border-b border-warning/20">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-amber-800">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span className="text-xs font-black uppercase tracking-wide">
                            只读兼容 / Read-only compatibility
                        </span>
                    </div>
                    <div className="text-sm font-black text-foreground mt-1 truncate">
                        {node.name || node.platform}
                    </div>
                </div>
                <Button variant="ghost" size="sm"
                    type="button"
                    aria-label="Delete invalid template"
                    onClick={() => onDelete(node.id)}
                    className="p-2 -mr-2 text-muted-foreground hover:text-red-500 transition-colors"
                >
                    <Trash2 size={16} aria-hidden="true" />
                </Button>
            </div>
            <div className="p-4 text-xs text-muted-foreground space-y-2">
                <p>
                    此模板来自当前版本无法安全解析的数据。为避免静默改写，不能编辑或另存模板。
                </p>
                <div className="flex justify-between rounded-lg bg-muted px-3 py-2">
                    <span className="font-bold text-muted-foreground">Site</span>
                    <span className="font-bold">{node.currency || 'Unknown'}</span>
                </div>
                {schemaVersion !== undefined && (
                    <div className="flex justify-between rounded-lg bg-muted px-3 py-2">
                        <span className="font-bold text-muted-foreground">Schema</span>
                        <span className="font-bold">{schemaVersion}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
