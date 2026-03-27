import React from 'react';
import { useChromaV2App } from './hooks/useChromaV2App';
import ControlPanel from './components/ControlPanel';
import PreviewPanel from './components/PreviewPanel';
import { AppMode } from './chromaV2Types';
import { getTranslation } from './utils/translations';
import { Palette, Edit3, Languages, ImagePlus, RotateCcw, Globe } from 'lucide-react';

const ChromaAdaptV2: React.FC = () => {
  const {
    state,
    isExporting,
    setMode,
    handleFileUpload,
    handlePipelineBatchUpload,
    handleRemoveImage,
    handleRemovePipelineItem,
    handleGenerate,
    handleAnalyzeSecondary,
    handleBatchTranslateStart,
    handleExport,
    handleStyleChange,
    resetApp,
    toggleLanguage,
    setTranslationTarget,
    setTargetFont,
    onEditPromptChange,
    onEditUserInputChange,
    setSecondaryWorkflowMode,
    setColorWorkflowMode,
    handleAnalyzeColorAdapt,
    handleAnalyzeEdit,
    setAnalysisModel,
    setGenerationModel,
    setConcurrentCount,
    handleSelectResult,
    handleSecondaryBatchUpload,
    handleRemoveSecondaryBatchItem,
    handleClearSecondaryBatch,
    handleSecondaryBatchGenerate
  } = useChromaV2App();

  const t = getTranslation(state.language);

  const modes: { key: AppMode; label: string; icon: React.ReactNode }[] = [
    { key: 'COLOR_ADAPT', label: t.modeColor, icon: <Palette size={15} /> },
    { key: 'IMAGE_EDIT', label: t.modeEdit, icon: <Edit3 size={15} /> },
    { key: 'TRANSLATION', label: t.modeTranslate, icon: <Languages size={15} /> },
    { key: 'SECONDARY_GENERATION', label: t.modeSecondary, icon: <ImagePlus size={15} /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-800">{t.title}</h1>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{t.subtitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-all"
            >
              <Globe size={12} />
              {state.language === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              onClick={resetApp}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-all"
            >
              <RotateCcw size={12} />
              {t.reset}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-2 overflow-x-auto pb-1">
          {modes.map(mode => (
            <button
              key={mode.key}
              onClick={() => setMode(mode.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                state.mode === mode.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {mode.icon}
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[380px] flex-shrink-0 border-r border-slate-200 overflow-hidden">
          <ControlPanel
            state={state}
            t={t}
            onFileUpload={handleFileUpload}
            onRemoveImage={handleRemoveImage}
            onStyleChange={handleStyleChange}
            onGenerate={handleGenerate}
            onEditPromptChange={onEditPromptChange}
            onEditUserInputChange={onEditUserInputChange}
            onTranslationTargetChange={setTranslationTarget}
            onTargetFontChange={setTargetFont}
            onAnalyzeSecondary={handleAnalyzeSecondary}
            onAnalyzeEdit={handleAnalyzeEdit}
            onAnalyzeColorAdapt={handleAnalyzeColorAdapt}
            onSecondaryWorkflowModeChange={setSecondaryWorkflowMode}
            onColorWorkflowModeChange={setColorWorkflowMode}
            onPipelineBatchUpload={handlePipelineBatchUpload}
            onBatchTranslateStart={handleBatchTranslateStart}
            onSecondaryBatchUpload={handleSecondaryBatchUpload}
            onSecondaryBatchGenerate={handleSecondaryBatchGenerate}
            onRemoveSecondaryBatchItem={handleRemoveSecondaryBatchItem}
            onClearSecondaryBatch={handleClearSecondaryBatch}
            onAnalysisModelChange={setAnalysisModel}
            onGenerationModelChange={setGenerationModel}
            onConcurrentCountChange={setConcurrentCount}
            onRemovePipelineItem={handleRemovePipelineItem}
          />
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <PreviewPanel
            state={state}
            t={t}
            onExport={handleExport}
            isExporting={isExporting}
            onSelectResult={handleSelectResult}
          />
        </div>
      </div>
    </div>
  );
};

export default ChromaAdaptV2;
