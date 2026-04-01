
import React, { useState } from 'react';
import { Languages, Palette, ImagePlus, Copy, Globe, ChevronDown, RotateCcw, Cpu } from 'lucide-react';
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
    <div className="h-full bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden">
      {state.errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl flex items-center gap-3 shadow-lg shadow-red-100 animate-in slide-in-from-top-2 duration-300">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-sm font-medium">{state.errorMessage}</span>
        </div>
      )}

      <div className="shrink-0 px-4 sm:px-6 lg:px-8 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center bg-slate-100/80 backdrop-blur-sm p-1 rounded-2xl gap-0.5">
            {navItems.map((item) => {
              const isActive = state.mode === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                  }`}
                >
                  <Icon size={15} className={isActive ? 'text-brand-500' : 'text-slate-400'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-slate-100/80 text-sm font-medium text-slate-500 transition-colors"
            >
              <Globe size={14} />
              <span>{state.language === 'en' ? '中文' : 'EN'}</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-slate-100/80 text-sm font-medium text-slate-500 transition-colors"
              >
                <Cpu size={14} />
                <span className="hidden sm:inline">模型</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {modelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 z-50 py-1.5 min-w-[220px] animate-in slide-in-from-top-1.5 duration-150">
                    <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">分析模型</div>
                    {analysisModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setAnalysisModel(model.id); setModelDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${state.analysisModel === model.id ? 'text-brand-600 font-medium' : 'text-slate-600'}`}
                      >
                        {model.label}
                        {state.analysisModel === model.id && <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 my-1"></div>
                    <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">生图模型</div>
                    {generationModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setGenerationModel(model.id); setModelDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${state.generationModel === model.id ? 'text-brand-600 font-medium' : 'text-slate-600'}`}
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
              className="p-2 rounded-xl text-slate-400 hover:text-brand-500 hover:bg-slate-100/80 transition-colors"
              title={t.reset}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
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
