import React from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { PLATFORMS, PlatformType } from '../../platformConfig';
import { ProfitTemplate } from './types';

interface AddNodeMenuProps {
    showAddMenu: boolean;
    setShowAddMenu: (show: boolean) => void;
    selectedPlatform: PlatformType;
    setSelectedPlatform: (platform: PlatformType) => void;
    siteCountry: string;
    allTemplates: ProfitTemplate[];
    onAddFromTemplate: (tpl: ProfitTemplate) => void;
    onAddBlank: () => void;
    onDeleteTemplate: (id: string, e: React.MouseEvent) => void;
    t: any;
}

export const AddNodeMenu: React.FC<AddNodeMenuProps> = ({
    showAddMenu, setShowAddMenu, selectedPlatform, setSelectedPlatform,
    siteCountry, allTemplates, onAddFromTemplate, onAddBlank, onDeleteTemplate, t
}) => (
    <div className="relative">
        <button onClick={() => setShowAddMenu(!showAddMenu)} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition shadow-sm">
            <Plus size={14} /> {t.matrix.addNode}
        </button>
        
        {showAddMenu && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">{t.matrix.useTemplate}</h4>
                <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
                    {allTemplates.filter(tpl => tpl.country === siteCountry).map(tpl => (
                        <div key={tpl.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200" onClick={() => onAddFromTemplate(tpl)}>
                            <div>
                                <div className="text-sm font-bold text-slate-700">{tpl.name}</div>
                                <div className="text-[10px] text-slate-400 capitalize">{t.matrix.platforms[tpl.platform || 'other'] || tpl.platform}</div>
                            </div>
                            <button onClick={(e) => tpl.id && onDeleteTemplate(tpl.id, e)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded">
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {allTemplates.filter(tpl => tpl.country === siteCountry).length === 0 && <p className="text-xs text-slate-400 text-center py-2">{t.templates.empty || '暂无模版'}</p>}
                </div>
                <div className="pt-3 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-tighter">{t.matrix.createBlank}</h4>
                    <div className="flex gap-2 mb-3">
                        <div className="flex-1 relative group">
                            <div className="w-full text-[11px] font-bold p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">{t.matrix.sites[siteCountry] || siteCountry} ({siteCountry})</div>
                        </div>
                        <div className="flex-1 relative group">
                            <select 
                                value={selectedPlatform} 
                                onChange={e => setSelectedPlatform(e.target.value as PlatformType)} 
                                className="w-full text-[11px] font-bold p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer capitalize shadow-sm hover:bg-slate-100/50"
                            >
                                {Object.keys(PLATFORMS).map(p => (
                                    <option key={p} value={p} className="font-sans py-2">{t.matrix.platforms[p as PlatformType] || PLATFORMS[p as PlatformType].name}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors group-hover:text-slate-600" />
                        </div>
                    </div>
                    <button 
                        onClick={onAddBlank}
                        className="w-full bg-slate-900 hover:bg-black text-white font-bold text-[11px] py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                    >
                        {t.matrix.newNode}
                    </button>
                </div>
            </div>
        )}
        {showAddMenu && <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />}
    </div>
);
