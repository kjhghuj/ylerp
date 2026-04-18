import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { Save, Calculator, Building } from 'lucide-react';
import api from '../src/api';

import { PlatformCard } from './PlatformCard';
import { ProfitTemplate, SiteLevelInputs, DEFAULT_SITE_INPUTS } from './profit/types';
import { useProfitImport } from './profit/useProfitImport';
import { useProductActions } from './profit/useProductActions';
import { useExchangeRates } from './profit/useExchangeRates';
import { AddNodeMenu } from './profit/AddNodeMenu';
import { GlobalInputsPanel } from './profit/GlobalInputsPanel';
import { PlatformType } from '../platformConfig';

export const ProfitCalculator: React.FC = () => {
    const store = useStore();
    const {
        strings,
        setProfitGlobalInputs: setGlobalInputs,
        profitSiteCountry: siteCountry,
        setProfitSiteCountry: setSiteCountry,
        profitNodes,
        setProfitNodes,
        profitEditingProductId: editingProductId,
        profitGlobalInputs,
    } = store;
    const t = strings.profit;

    const [allTemplates, setAllTemplates] = useState<ProfitTemplate[]>([]);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('shopee');
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [useLocalCurrency, setUseLocalCurrency] = useState(false);

    const [siteInputsMap, setSiteInputsMap] = useState<Record<string, SiteLevelInputs>>({
        'MYR': { ...DEFAULT_SITE_INPUTS },
        'SGD': { ...DEFAULT_SITE_INPUTS },
        'PHP': { ...DEFAULT_SITE_INPUTS },
        'THB': { ...DEFAULT_SITE_INPUTS },
        'IDR': { ...DEFAULT_SITE_INPUTS },
    });

    useProfitImport(siteInputsMap, setSiteInputsMap);

    const { rates, isLoading, lastUpdated, fetchRates: refreshRates } = useExchangeRates();

    useEffect(() => {
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
        fetchTemplates();
    }, []);

    const {
        nodes, handleGlobalChange, handleUpdateNode, handleDeleteNode,
        handleAddNodeFromTemplate, handleAddBlankNode, handleSaveTemplate,
        handleDeleteTemplate, handleSaveProduct,
    } = useProductActions(allTemplates, setAllTemplates, rates, siteInputsMap, setSiteInputsMap);

    const handleReset = () => {
        setGlobalInputs(prev => ({
            ...prev,
            name: '',
            sku: '',
            purchaseCost: 0,
            productWeight: 0,
        }));
        setSiteInputsMap({
            'MYR': { ...DEFAULT_SITE_INPUTS },
            'SGD': { ...DEFAULT_SITE_INPUTS },
            'PHP': { ...DEFAULT_SITE_INPUTS },
            'THB': { ...DEFAULT_SITE_INPUTS },
            'IDR': { ...DEFAULT_SITE_INPUTS },
        });
        setProfitNodes(prev => {
            const updated = { ...prev };
            for (const country of Object.keys(updated)) {
                updated[country] = [];
            }
            return updated;
        });
    };

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
                globalInputs={profitGlobalInputs}
                siteCountry={siteCountry}
                useLocalCurrency={useLocalCurrency}
                rates={rates}
                onGlobalChange={handleGlobalChange}
                onSetGlobalInputs={setGlobalInputs}
                onSetUseLocalCurrency={setUseLocalCurrency}
                onSetSiteCountry={setSiteCountry}
                t={t}
                currentRate={rates[siteCountry] || 0}
                isLoadingRate={isLoading}
                lastUpdated={lastUpdated}
                onRefreshRates={refreshRates}
                onReset={handleReset}
                siteInputs={siteInputsMap[siteCountry] || DEFAULT_SITE_INPUTS}
                onSiteInputChange={(field, value) => {
                    setSiteInputsMap(prev => ({
                        ...prev,
                        [siteCountry]: {
                            ...prev[siteCountry],
                            [field]: value,
                        }
                    }));
                }}
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
                            globalInputs={profitGlobalInputs}
                            siteInputs={siteInputsMap[node.country] || DEFAULT_SITE_INPUTS}
                            rateToCNY={rates[node.country] || 1}
                            strings={t}
                            onUpdate={handleUpdateNode}
                            onDelete={handleDeleteNode}
                            onSaveTemplate={handleSaveTemplate}
                            useLocalCurrency={useLocalCurrency}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
