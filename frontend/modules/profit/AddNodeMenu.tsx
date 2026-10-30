import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { PLATFORMS, PlatformType } from '../../platformConfig';
import { ProfitTemplate } from './types';
import type { NodeGraphTemplate } from './nodeGraphTypes';
import { matchesActiveSite } from '../productTemplateImport';
import { translations } from '../../translations';
type ProfitStrings = typeof translations['zh']['profit'];

interface AddNodeMenuProps {
    showAddMenu: boolean;
    setShowAddMenu: (show: boolean) => void;
    selectedPlatform: PlatformType;
    setSelectedPlatform: (platform: PlatformType) => void;
    siteCountry: string;
    allTemplates: ProfitTemplate[];
    graphTemplates?: Pick<NodeGraphTemplate, 'id' | 'name' | 'country' | 'platform' | 'type'>[];
    onAddFromTemplate: (tpl: ProfitTemplate) => void;
    onAddFromGraphTemplate?: (tpl: Pick<NodeGraphTemplate, 'id' | 'name' | 'country' | 'platform' | 'type'>) => void;
    onAddBlank: () => void;
    onDeleteTemplate: (id: string, e: React.MouseEvent) => void;
    t: ProfitStrings;
}


export const AddNodeMenu: React.FC<AddNodeMenuProps> = ({ showAddMenu, setShowAddMenu, selectedPlatform, setSelectedPlatform, siteCountry, allTemplates, graphTemplates = [], onAddFromTemplate, onAddFromGraphTemplate, onAddBlank, onDeleteTemplate, t }) => {
    const platformId = React.useId();
    const siteTemplates = allTemplates.filter(tpl => matchesActiveSite(tpl.country, siteCountry));
    return <Popover open={showAddMenu} onOpenChange={setShowAddMenu}>
        <PopoverTrigger asChild><Button variant="outline" size="sm"><Plus size={14} />{t.matrix.addNode}</Button></PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground">{t.matrix.useTemplate}</h4>
            {graphTemplates.length > 0 && <div className="max-h-40 space-y-1 overflow-y-auto">
                {graphTemplates.map(tpl => <Button key={tpl.id} variant="ghost" onClick={() => onAddFromGraphTemplate?.(tpl)} className="h-auto w-full justify-start px-2 py-2 text-left">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{tpl.name}</span><span className="block text-xs text-success">节点设计 · {tpl.platform || 'other'}</span></span>
                </Button>)}
            </div>}
            <div className="max-h-48 space-y-1 overflow-y-auto">
                {siteTemplates.map(tpl => <div key={tpl.id} className="flex items-center gap-1 rounded-md hover:bg-muted">
                    <Button variant="ghost" onClick={() => onAddFromTemplate(tpl)} className="h-auto min-w-0 flex-1 justify-start p-2 text-left">
                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{tpl.name}</span><span className="block text-xs text-muted-foreground">{t.matrix.platforms[tpl.platform || 'other'] || tpl.platform}</span></span>
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="删除模板" title={tpl.name} className="h-8 w-8 shrink-0 text-danger" onClick={event => { if (tpl.id) onDeleteTemplate(tpl.id, event); }}><Trash2 size={14} /></Button>
                </div>)}
                {!siteTemplates.length && <p className="py-2 text-center text-xs text-muted-foreground">{t.templates.empty}</p>}
            </div>
            <div className="space-y-3 border-t border-border pt-3">
                <h4 className="text-xs font-semibold text-muted-foreground">{t.matrix.createBlank}</h4>
                <div className="grid grid-cols-2 items-center gap-2">
                    <span className="rounded-md bg-accent p-2 text-xs font-medium text-primary">{t.matrix.sites[siteCountry] || siteCountry} ({siteCountry})</span>
                    <Select value={siteCountry === 'USD' ? 'tiktok' : selectedPlatform} onValueChange={value => setSelectedPlatform(value as PlatformType)}>
                        <SelectTrigger id={platformId} aria-label="平台" className="min-w-0 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Object.keys(PLATFORMS).filter(platform => siteCountry !== 'USD' || platform === 'tiktok').map(platform => <SelectItem key={platform} value={platform}>{t.matrix.platforms[platform as PlatformType] || PLATFORMS[platform as PlatformType].name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={onAddBlank} className="w-full">{siteCountry === 'USD' ? t.templates.newCrossBorderNode : t.matrix.newNode}</Button>
            </div>
        </PopoverContent>
    </Popover>;
};
