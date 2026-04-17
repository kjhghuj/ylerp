import React, { useState } from 'react';
import { FileSpreadsheet, Plus, Trash2, Layers } from 'lucide-react';
import { WarehouseMapping } from '../../../types';
import { useStore } from '../../../StoreContext';

interface MappingManagerProps {
    mappings: WarehouseMapping[];
    onOpenImportModal: (type: 'official' | 'third' | 'grouping') => void;
    t: any;
}

export const MappingManager: React.FC<MappingManagerProps> = ({ mappings, onOpenImportModal, t }) => {
    const { addMapping, deleteMapping, skuGroupMappings, addSkuGroup, deleteSkuGroup } = useStore();
    const [activeTab, setActiveTab] = useState<'official' | 'third' | 'grouping'>('official');
    
    // State for simple mappings
    const [newMapping, setNewMapping] = useState({ externalId: '', sku: '' });
    // State for group mappings
    const [newGroup, setNewGroup] = useState({ groupName: '', skus: '' });

    const handleAddMapping = () => {
        if(newMapping.externalId && newMapping.sku) {
            const mapping: WarehouseMapping = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sku: newMapping.sku,
                type: activeTab as 'official' | 'third'
            };

            if (activeTab === 'official') {
                mapping.officialWarehouseId = newMapping.externalId;
            } else {
                mapping.thirdPartyWarehouseId = newMapping.externalId;
            }

            addMapping(mapping);
            setNewMapping({ externalId: '', sku: '' });
        }
    };

    const handleAddGroup = () => {
        if(newGroup.groupName && newGroup.skus) {
            // Split by comma and clean
            const skuList = newGroup.skus.split(/[,，\n]+/).map(s => s.trim()).filter(s => s.length > 0);
            if (skuList.length > 0) {
                addSkuGroup({
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    groupName: newGroup.groupName,
                    skus: skuList
                });
                setNewGroup({ groupName: '', skus: '' });
            }
        }
    };

    const currentMappings = mappings.filter(m => m.type === activeTab);

    return (
       <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 animate-in slide-in-from-top-2">
           <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
              <div className="flex gap-4">
                  <h3 className="font-bold text-slate-700 self-center">{t.imports.mappingTitle}</h3>
                  <div className="flex bg-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => setActiveTab('official')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${activeTab === 'official' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          {t.imports.tabs.official}
                      </button>
                      <button 
                        onClick={() => setActiveTab('third')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${activeTab === 'third' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          {t.imports.tabs.third}
                      </button>
                      <button 
                        onClick={() => setActiveTab('grouping')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${activeTab === 'grouping' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          {t.imports.tabs.grouping}
                      </button>
                  </div>
              </div>
              <button 
                onClick={() => onOpenImportModal(activeTab)}
                className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 hover:bg-blue-200 transition"
              >
                  <FileSpreadsheet size={14} /> {t.imports.importMappingBtn}
              </button>
           </div>

           {/* Content for Simple Mappings */}
           {activeTab !== 'grouping' ? (
               <>
                   <div className="flex flex-col sm:flex-row gap-2 mb-4">
                       <input 
                            type="text" 
                            placeholder={activeTab === 'official' ? t.imports.officialId : t.imports.thirdPartyId} 
                            value={newMapping.externalId}
                            onChange={e => setNewMapping({...newMapping, externalId: e.target.value})}
                            className="p-2 border rounded-lg text-sm flex-1"
                       />
                       <input 
                            type="text" 
                            placeholder={t.imports.sku} 
                            value={newMapping.sku}
                            onChange={e => setNewMapping({...newMapping, sku: e.target.value})}
                            className="p-2 border rounded-lg text-sm flex-1"
                       />
                       <button onClick={handleAddMapping} className="bg-blue-600 text-white p-2 rounded-lg self-end sm:self-auto">
                           <Plus size={20} />
                       </button>
                   </div>
                   <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-slate-200">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-slate-50 text-slate-500 sticky top-0">
                               <tr>
                                   <th className="p-2">
                                       {activeTab === 'official' ? t.imports.officialId : t.imports.thirdPartyId}
                                   </th>
                                   <th className="p-2">{t.imports.sku}</th>
                                   <th className="p-2 w-10"></th>
                               </tr>
                           </thead>
                           <tbody>
                               {currentMappings.map(m => (
                                   <tr key={m.id} className="border-t border-slate-100">
                                       <td className="p-2">
                                           {activeTab === 'official' ? m.officialWarehouseId : m.thirdPartyWarehouseId}
                                       </td>
                                       <td className="p-2 font-medium">{m.sku}</td>
                                       <td className="p-2">
                                           <button onClick={() => deleteMapping(m.id)} className="text-slate-400 hover:text-red-500">
                                               <Trash2 size={14} />
                                           </button>
                                       </td>
                                   </tr>
                               ))}
                               {currentMappings.length === 0 && (
                                   <tr>
                                       <td colSpan={3} className="p-4 text-center text-slate-400 italic text-xs">No mappings found.</td>
                                   </tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </>
           ) : (
               /* Content for Grouping Rules */
               <>
                   <div className="flex flex-col sm:flex-row gap-2 mb-4">
                       <input 
                            type="text" 
                            placeholder={t.imports.groupName} 
                            value={newGroup.groupName}
                            onChange={e => setNewGroup({...newGroup, groupName: e.target.value})}
                            className="p-2 border rounded-lg text-sm w-full sm:w-1/3"
                       />
                       <input 
                            type="text" 
                            placeholder={t.imports.skusList} 
                            value={newGroup.skus}
                            onChange={e => setNewGroup({...newGroup, skus: e.target.value})}
                            className="p-2 border rounded-lg text-sm flex-1"
                       />
                       <button onClick={handleAddGroup} className="bg-indigo-600 text-white p-2 rounded-lg self-end sm:self-auto">
                           <Plus size={20} />
                       </button>
                   </div>
                   <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-slate-200">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-slate-50 text-slate-500 sticky top-0">
                               <tr>
                                   <th className="p-2">{t.imports.groupName}</th>
                                   <th className="p-2">{t.table.product} SKUs</th>
                                   <th className="p-2 w-10"></th>
                               </tr>
                           </thead>
                           <tbody>
                               {skuGroupMappings.map(m => (
                                   <tr key={m.id} className="border-t border-slate-100">
                                       <td className="p-2 font-bold text-indigo-700">
                                           <div className="flex items-center gap-1">
                                               <Layers size={14} /> {m.groupName}
                                           </div>
                                       </td>
                                       <td className="p-2">
                                           <div className="flex flex-wrap gap-1">
                                               {m.skus.map((sku, i) => (
                                                   <span key={i} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-600">
                                                       {sku}
                                                   </span>
                                               ))}
                                           </div>
                                       </td>
                                       <td className="p-2">
                                           <button onClick={() => deleteSkuGroup(m.id)} className="text-slate-400 hover:text-red-500">
                                               <Trash2 size={14} />
                                           </button>
                                       </td>
                                   </tr>
                               ))}
                               {skuGroupMappings.length === 0 && (
                                   <tr>
                                       <td colSpan={3} className="p-4 text-center text-slate-400 italic text-xs">{t.imports.noGroups}</td>
                                   </tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </>
           )}
       </div>
    );
};
