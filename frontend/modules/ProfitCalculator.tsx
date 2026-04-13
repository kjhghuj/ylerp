import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { Save, Calculator, Building } from 'lucide-react';
import api from '../src/api';

import { PlatformCard } from './PlatformCard';
import { ProfitTemplate } from './profit/types';
import { useProfitImport } from './profit/useProfitImport';
import { useProductActions } from './profit/useProductActions';
import { AddNodeMenu } from './profit/AddNodeMenu';
import { GlobalInputsPanel } from './profit/GlobalInputsPanel';
import { PlatformType } from '../platformConfig';

export const ProfitCalculator: React.FC = () => {
    const {
        strings,
        setProfitGlobalInputs: setGlobalInputs,
        profitSiteCountry: siteCountry,
        setProfitSiteCountry: setSiteCountry,
        profitNodes,
        profitEditingProductId: editingProductId,
    } = useStore();
    const t = strings.profit;

    useProfitImport();

    const [allTemplates, setAllTemplates] = useState<ProfitTemplate[]>([]);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('shopee');
    const [rates, setRates] = useState<Record<string, number>>({ MYR: 0, PHP: 0, SGD: 0, THB: 0, IDR: 0 });
    const [templatesLoaded, setTemplatesLoaded] = useState(false);

    const fetchTemplates = async () => {
        try {
            const response = await api.get(`/templates?type=profit`);
            setAllTemplates(response.data);
            setTemplatesLoaded(true);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
            setAllTemplates([]);
            setTemplatesLoaded(true);
        }
    };

    const fetchRates = async () => {
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
            if (response.ok) {
                const data = await response.json();
                setRates(data.rates);
            }
        } catch (error) {
            console.warn("Using fallback rates");
            setRates({ MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 });
        }
    };

    useEffect(() => {
        fetchTemplates();
        fetchRates();
    }, []);

    const {
        nodes, handleGlobalChange, handleUpdateNode, handleDeleteNode,
        handleAddNodeFromTemplate, handleAddBlankNode, handleSaveTemplate,
        handleDeleteTemplate, handleSaveProduct,
    } = useProductActions(allTemplates, setAllTemplates, rates);

    return (
        <div className="flex flex-col min-h-[calc(100vh-140px)] pb-6">
            {/* Header Bar */}
            <div className="px-4 py-3 bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 mb-3 flex justify-between items-center shrink-0 z-20">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white shadow-lg"><Calculator size={18} /></div>
                    <div>
                        <h2 className="text-sm font-black tracking-wide uppercase">{t.matrix.title}</h2>
                        <div className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{t.matrix.subtitle}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <AddNodeMenu
                        showAddMenu={showAddMenu}
                        setShowAddMenu={setShowAddMenu}
                        selectedPlatform={selectedPlatform}
                        setSelectedPlatform={setSelectedPlatform}
                        siteCountry={siteCountry}
                        allTemplates={allTemplates}
                        onAddFromTemplate={(tpl) => { handleAddNodeFromTemplate(tpl); setShowAddMenu(false); }}
                        onAddBlank={() => { handleAddBlankNode(selectedPlatform); setShowAddMenu(false); }}
                        onDeleteTemplate={handleDeleteTemplate}
                        t={t}
                    />

                    <button onClick={handleSaveProduct} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 transition shadow-sm">
                        <Save size={14} /> <span className="hidden sm:inline">{editingProductId ? t.matrix.updateLibrary : t.matrix.saveToLibrary}</span>
                    </button>
                </div>
            </div>

            {/* Global Product Inputs */}
            <GlobalInputsPanel
                globalInputs={useStore().profitGlobalInputs}
                siteCountry={siteCountry}
                rates={rates}
                onGlobalChange={handleGlobalChange}
                onSetGlobalInputs={setGlobalInputs}
                onSetSiteCountry={setSiteCountry}
                t={t}
            />

            {/* Matrix Scroll Area */}
            <div className="flex-1 min-h-0 relative rounded-xl bg-slate-50/50 border border-slate-100 p-4 overflow-x-auto flex gap-4 items-start snap-x">
                {nodes.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <Building size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">{t.matrix.nodeEmpty}</p>
                        <p className="text-sm mt-1">{t.matrix.nodeEmptyDesc}</p>
                    </div>
                ) : (
                    nodes.map(node => (
                        <PlatformCard
                            key={node.id}
                            nodeId={node.id}
                            platform={node.platform}
                            country={node.country}
                            nodeName={node.name}
                            data={node.data}
                            globalInputs={useStore().profitGlobalInputs}
                            rateToCNY={rates[node.country] || 1}
                            strings={t}
                            onUpdate={handleUpdateNode}
                            onDelete={handleDeleteNode}
                            onSaveTemplate={handleSaveTemplate}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
