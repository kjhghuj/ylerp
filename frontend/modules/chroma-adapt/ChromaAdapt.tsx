
import React, { useState } from 'react';
import { Languages, Palette, ImagePlus, Copy, Globe, ChevronDown, RotateCcw } from 'lucide-react';
import { AppMode, AnalysisModel, GenerationModel } from './chromaTypes';
import { getTranslation } from './utils/translations';
import { useChromaApp } from './hooks/useChromaApp';
import ControlPanel from './components/ControlPanel';
import PreviewPanel from './components/PreviewPanel';

export const ChromaAdapt: React.FC = () => {
  const {
    state,
    isExporting,
    setMode,
    handleFileUpload,
    handleRemoveImage,
    handleGenerate,
    handleAnalyzeSecondary,
    handleAnalyzeColorAdapt,
    handleAnalyzeEdit,
    handleExport,
    handleStyleChange,
    resetApp,
    toggleLanguage,
    setTranslationTarget,
    setTargetFont,
    onEditPromptChange,
    onEditUserInputChange,
    handlePipelineBatchUpload,
    handleRemovePipelineItem,
    handleBatchTranslateStart,
    setConcurrentCount,
    handleSelectResult,
    handleSecondaryBatchUpload,
    handleRemoveSecondaryBatchItem,
    handleClearSecondaryBatch,
    handleSecondaryBatchGenerate,
    setGenerationModel,
    setAnalysisModel,
    setSecondaryWorkflowMode,
    setColorWorkflowMode
  } = useChromaApp();

  const t = getTranslation(state.language);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const navItems = [
    { id: 'TRANSLATION' as AppMode, icon: Languages, label: t.modeTranslate },
    { id: 'IMAGE_EDIT' as AppMode, icon: ImagePlus, label: t.modeEdit },
    { id: 'SECONDARY_GENERATION' as AppMode, icon: Copy, label: t.modeSecondary },
    { id: 'COLOR_ADAPT' as AppMode, icon: Palette, label: t.modeColor },
  ];

  const analysisModels: { id: AnalysisModel; label: string }[] = [
    { id: 'doubao-seed-2-0-lite', label: 'Seed-2.0-lite' },
    { id: 'doubao-seed-2-0-mini', label: 'Seed-2.0-mini' },
    { id: 'doubao-seed-2-0-pro', label: 'Seed-2.0-pro' },
  ];

  const generationModels: { id: GenerationModel; label: string }[] = [
    { id: 'doubao-seedream-4.5', label: 'Seedream-4.5' },
    { id: 'doubao-seedream-5.0-lite', label: 'Seedream-5.0-lite' },
  ];

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      {state.errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg flex items-center gap-3 shadow-lg">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          {state.errorMessage}
        </div>
      )}

      <div className="shrink-0 px-4 sm:px-6 lg:px-8 pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const isActive = state.mode === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-brand-50/80 rounded-xl -z-10 ring-1 ring-brand-200/50"></div>
                  )}
                  <Icon size={16} className={`relative z-10 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-100 text-sm font-medium text-slate-600 transition-colors"
            >
              <Globe size={14} />
              <span>{state.language === 'en' ? '中文' : 'EN'}</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-100 text-sm font-medium text-slate-600 transition-colors border border-slate-200"
              >
                <span>模型</span>
                <ChevronDown size={14} className={`transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {modelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-2 min-w-[200px]">
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">分析模型</div>
                    {analysisModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setAnalysisModel(model.id); setModelDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${state.analysisModel === model.id ? 'text-brand-600 font-medium' : 'text-slate-600'}`}
                      >
                        {model.label}
                        {state.analysisModel === model.id && <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 my-1"></div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">生图模型</div>
                    {generationModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setGenerationModel(model.id); setModelDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${state.generationModel === model.id ? 'text-brand-600 font-medium' : 'text-slate-600'}`}
                      >
                        {model.label}
                        {state.generationModel === model.id && <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={resetApp}
              className="text-sm text-slate-500 hover:text-brand-600 transition-colors px-2"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          <ControlPanel
            state={state}
            onFileUpload={handleFileUpload}
            onRemoveImage={handleRemoveImage}
            onStyleChange={handleStyleChange}
            onTranslationTargetChange={setTranslationTarget}
            onGenerate={handleGenerate}
            onAnalyzeSecondary={handleAnalyzeSecondary}
            onAnalyzeColorAdapt={handleAnalyzeColorAdapt}
            onAnalyzeEdit={handleAnalyzeEdit}
            onTargetFontChange={setTargetFont}
            onEditPromptChange={onEditPromptChange}
            onEditUserInputChange={onEditUserInputChange}
            onPipelineBatchUpload={handlePipelineBatchUpload}
            onBatchTranslateStart={handleBatchTranslateStart}
            onConcurrentCountChange={setConcurrentCount}
            onSecondaryBatchUpload={handleSecondaryBatchUpload}
            onSecondaryBatchGenerate={handleSecondaryBatchGenerate}
            onRemoveSecondaryBatchItem={handleRemoveSecondaryBatchItem}
            onClearSecondaryBatch={handleClearSecondaryBatch}
            onSecondaryWorkflowModeChange={setSecondaryWorkflowMode}
            onColorWorkflowModeChange={setColorWorkflowMode}
          />
          <PreviewPanel
            state={state}
            onExport={handleExport}
            isExporting={isExporting}
            onRemoveItem={handleRemovePipelineItem}
            onSelectResult={handleSelectResult}
            onRemoveSecondaryBatchItem={handleRemoveSecondaryBatchItem}
          />
        </div>
      </div>
    </div>
  );
};
