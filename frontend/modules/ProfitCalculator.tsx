import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../StoreContext';
import { Save, Calculator, Building } from 'lucide-react';
import api from '../src/api';
import { useToast } from '../components/Toast';

import { PlatformCard } from './PlatformCard';
import { ProfitTemplate, SiteLevelInputs, DEFAULT_SITE_INPUTS } from './profit/types';
import type { NodeGraphTemplate } from './profit/nodeGraphTypes';
import { useProfitImport } from './profit/useProfitImport';
import { useProductActions } from './profit/useProductActions';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { AddNodeMenu } from './profit/AddNodeMenu';
import { GlobalInputsPanel } from './profit/GlobalInputsPanel';
import { GraphTemplateCard } from './profit/GraphTemplateCard';
import { InvalidTemplateCard } from './profit/InvalidTemplateCard';
import { ProductIdentityDialog } from './profit/ProductIdentityDialog';
import { TargetPricingPanel } from './profit/TargetPricingPanel';
import { PlatformType } from '../platformConfig';

export const ProfitCalculator: React.FC = () => {
    const store = useStore();
    const {
        strings,
        setProfitGlobalInputs: setGlobalInputs,
        profitSiteCurrency: siteCountry,
        setProfitSiteCurrency: setSiteCountry,
        profitEditingProductId: editingProductId,
        profitGlobalInputs,
        profitSiteInputsMap,
        setProfitSiteInputsMap,
    } = store;
    const t = strings.profit;
    const { showToast } = useToast();

    const [allTemplates, setAllTemplates] = useState<ProfitTemplate[]>([]);
    const [graphTemplates, setGraphTemplates] = useState<Pick<NodeGraphTemplate, 'id' | 'name' | 'country' | 'platform' | 'type'>[]>([]);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('shopee');
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [useLocalCurrency, setUseLocalCurrency] = useState(false);
    const [pricingSession, setPricingSession] = useState(0);
    const [pricingBasisId, setPricingBasisId] = useState<string | null>(null);
    const resetPricing = useCallback(() => {
        setPricingSession(value => value + 1);
        setPricingBasisId(null);
    }, []);

    useProfitImport(profitSiteInputsMap, setProfitSiteInputsMap, resetPricing);

    const { rates, isLoading, lastUpdated, fetchRates: refreshRates, isStale } = useExchangeRates();

    useEffect(() => {
        if (isStale) {
            showToast(t.errors.rateFetchFailed, 'error');
        }
    }, [isStale, showToast, t.errors.rateFetchFailed]);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const response = await api.get(`/templates?type=profit`);
                setAllTemplates(response.data);
                setTemplatesLoaded(true);
            } catch {
                setAllTemplates([]);
                setTemplatesLoaded(true);
            }
        };
        fetchTemplates();
    }, []);

    useEffect(() => {
        const fetchGraphTemplates = async () => {
            try {
                const response = await api.get(`/node-graphs?type=profit&country=${encodeURIComponent(siteCountry)}`);
                setGraphTemplates(response.data || []);
            } catch {
                setGraphTemplates([]);
            }
        };
        fetchGraphTemplates();
    }, [siteCountry]);

    const {
        nodes, handleGlobalChange, handleUpdateNode, handleDeleteNode,
        handleAddNodeFromTemplate, handleAddNodeFromGraphTemplate, handleAddBlankNode,
        handleUpdateGraphNodeInputs, handleGraphNodeValidationChange, handleSaveTemplate,
        handleNodeInputValidationChange, handleDeleteTemplate, handleSaveProduct, inputErrors, clearInputError,
        handleSaveAsNew, handleConfirmIdentityUpdate, handleCancelIdentityUpdate,
        handleReset, editingProduct, pendingIdentityConfirmation, isSaving,
        nodeDraftErrors,
    } = useProductActions(allTemplates, setAllTemplates, rates, profitSiteInputsMap, setProfitSiteInputsMap);

    const formatInputError = (error: (typeof inputErrors)[number]): string => {
        switch (error.code) {
            case 'required': return t.errors.inputRequired;
            case 'min': return t.errors.inputMin.replace('{min}', String(error.min));
            case 'max': return t.errors.inputMax.replace('{max}', String(error.max));
            case 'invalid_enum': return t.errors.inputEnum;
            default: return t.errors.inputFinite;
        }
    };
    const inputErrorMessages = Object.fromEntries(
        inputErrors.map(error => [error.field, formatInputError(error)]),
    );
    const handleSiteInputChange = (field: string, value: string | number) => {
        clearInputError(field);
        setProfitSiteInputsMap(previous => ({
            ...previous,
            [siteCountry]: { ...(previous[siteCountry] || DEFAULT_SITE_INPUTS), [field]: value },
        }));
    };

    return (
        <div className="profit-workspace flex min-h-full min-w-0 flex-col">
            {/* Header Bar */}
            <div className="px-3 py-2 bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 mb-2 flex flex-wrap gap-2 justify-between items-center shrink-0 z-20">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white shadow-lg"><Calculator size={18} /></div>
                    <div>
                        <h2 className="text-sm font-black tracking-wide uppercase">{t.matrix.title}</h2>
                        <div className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{t.matrix.subtitle}</div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <AddNodeMenu
                        showAddMenu={showAddMenu}
                        setShowAddMenu={setShowAddMenu}
                        selectedPlatform={selectedPlatform}
                        setSelectedPlatform={setSelectedPlatform}
                        siteCountry={siteCountry}
                        allTemplates={allTemplates}
                        graphTemplates={graphTemplates}
                        onAddFromTemplate={(tpl) => { handleAddNodeFromTemplate(tpl); setShowAddMenu(false); }}
                        onAddFromGraphTemplate={(tpl) => { void handleAddNodeFromGraphTemplate(tpl); setShowAddMenu(false); }}
                        onAddBlank={() => { handleAddBlankNode(selectedPlatform); setShowAddMenu(false); }}
                        onDeleteTemplate={handleDeleteTemplate}
                        t={t}
                    />

                    {editingProductId && (
                        <button type="button" onClick={() => { void handleSaveAsNew(); }} disabled={isSaving}
                            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50">
                            {t.saveIdentity.saveAsNew}
                        </button>
                    )}
                    <button type="button" onClick={() => { void handleSaveProduct(); }} disabled={isSaving}
                        aria-busy={isSaving}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 transition shadow-sm disabled:opacity-50">
                        <Save size={14} /> <span>{editingProductId ? t.matrix.updateLibrary : t.matrix.saveToLibrary}</span>
                    </button>
                </div>
            </div>

            <p className="mb-2 break-words text-xs text-slate-600" role="status">
                {editingProductId
                    ? editingProduct
                        ? `${t.saveIdentity.editing} ${editingProduct.name} · ${editingProduct.sku}`
                        : t.errors.editingProductMissing
                    : t.saveIdentity.creating}
                {isSaving && <span className="ml-2">{t.saveIdentity.saving}</span>}
            </p>
            {pendingIdentityConfirmation && (
                <ProductIdentityDialog confirmation={pendingIdentityConfirmation} strings={t.saveIdentity}
                    onUpdate={() => { void handleConfirmIdentityUpdate(); }}
                    onSaveAsNew={() => { void handleSaveAsNew(); }}
                    onCancel={handleCancelIdentityUpdate} />
            )}

            {inputErrors.length > 0 && (
                <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                    <div>{t.errors.inputValidationFailed}</div>
                    <ul className="mt-1 list-disc pl-5 font-medium">
                        {inputErrors.map(error => (
                            <li key={`${error.field}-${error.code}`}>{error.field}: {formatInputError(error)}</li>
                        ))}
                    </ul>
                </div>
            )}

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
                onReset={() => { resetPricing(); handleReset(); }}
                siteInputs={profitSiteInputsMap[siteCountry] || DEFAULT_SITE_INPUTS}
                inputErrors={inputErrorMessages}
                onSiteInputChange={handleSiteInputChange}
                pricingPanel={<TargetPricingPanel key={pricingSession} nodes={nodes}
                    globalInputs={profitGlobalInputs} siteInputs={profitSiteInputsMap[siteCountry] || DEFAULT_SITE_INPUTS}
                    currency={siteCountry} exchangeRate={rates[siteCountry]} rateReady={Boolean(lastUpdated) && !isStale && !isLoading}
                    draftErrors={nodeDraftErrors} t={t} onBasisChange={setPricingBasisId}
                    onApply={revenue => {
                        handleSiteInputChange('totalRevenue', revenue);
                        showToast(t.targetPricing.applied);
                    }} />}
            />

            {/* Responsive node comparison: every card stays in the page flow. */}
            <div className="grid min-w-0 items-start gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
                {nodes.length === 0 ? (
                    <div className="col-span-full flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-slate-400">
                        <Building size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">{t.matrix.nodeEmpty}</p>
                        <p className="text-sm mt-1">{t.matrix.nodeEmptyDesc}</p>
                    </div>
                ) : (
                    nodes.map(node => node.persistedData?.kind === 'invalid' ? (
                        <InvalidTemplateCard
                            key={node.id}
                            node={node}
                            onDelete={handleDeleteNode}
                        />
                    ) : node.graphTemplateSnapshot ? (
                        <GraphTemplateCard
                            key={node.id}
                            node={node}
                            onUpdateInputs={handleUpdateGraphNodeInputs}
                            onValidationChange={handleGraphNodeValidationChange}
                            onDelete={handleDeleteNode}
                            errorLabels={t.graphErrors}
                        />
                    ) : (
                        <PlatformCard
                            key={node.id}
                            nodeId={node.id}
                            platform={node.platform}
                            country={node.currency}
                            nodeName={node.name}
                            isPricingBasis={node.id === pricingBasisId}
                            data={node.data}
                            globalInputs={profitGlobalInputs}
                            siteInputs={profitSiteInputsMap[node.currency] || DEFAULT_SITE_INPUTS}
                            rateToCNY={rates[node.currency]}
                            strings={t}
                            inputErrors={Object.fromEntries(
                                Object.entries(inputErrorMessages)
                                    .filter(([field]) => field.startsWith(`nodes.${node.id}.`))
                                    .map(([field, message]) => [field.slice(`nodes.${node.id}.`.length), message]),
                            )}
                            onUpdate={handleUpdateNode}
                            onDelete={handleDeleteNode}
                            onSaveTemplate={handleSaveTemplate}
                            onInputValidationChange={handleNodeInputValidationChange}
                            useLocalCurrency={useLocalCurrency}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
