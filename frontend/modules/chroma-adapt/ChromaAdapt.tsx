import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';

import React, { useState } from 'react';
import { Languages, Palette, ImagePlus, Copy, Globe, ChevronDown, RotateCcw, Cpu, History } from 'lucide-react';
import { AppMode, AnalysisModel, GenerationModel } from './chromaTypes';
import { getTranslation } from './utils/translations';
import { useChromaApp } from './hooks/useChromaApp';

import ControlPanel from './components/ControlPanel';
import PreviewPanel from './components/PreviewPanel';
import GenerationHistory from './components/GenerationHistory';

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
    setColorWorkflowMode,
    costSummary,
    savedImages,
    imagesTotal,
    records,
    recordsTotal,
    loadRecords,
    loadSavedImages,
    handleDeleteSavedImage
  } = useChromaApp();

  const t = getTranslation(state.language);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    <Tabs value={state.mode} onValueChange={value => setMode(value as AppMode)} className="min-w-0 h-full bg-background flex flex-col font-sans text-foreground overflow-hidden">
      {state.errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-destructive/10 border border-danger/30 text-danger px-5 py-3 rounded-xl flex items-center gap-3 shadow-lg shadow-none animate-in slide-in-from-top-2 duration-300">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse"></div>
          <span className="text-sm font-medium">{state.errorMessage}</span>
        </div>
      )}

      <div className="shrink-0 px-4 sm:px-6 lg:px-8 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 max-w-full overflow-x-auto"><TabsList className="h-auto justify-start">{navItems.map(item => <TabsTrigger key={item.id} value={item.id} className="gap-2 whitespace-nowrap py-2"><item.icon size={15} />{item.label}</TabsTrigger>)}</TabsList></div>

          <div className="flex items-center gap-1.5">
            <Button variant="ghost"
              onClick={toggleLanguage}
              className={cn("h-auto", "flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-muted/80 text-sm font-medium text-muted-foreground transition-colors")}
            >
              <Globe size={14} />
              <span>{state.language === 'en' ? '中文' : 'EN'}</span>
            </Button>
            <DropdownMenu open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
              <DropdownMenuTrigger asChild><Button variant="ghost" className="gap-1.5" aria-label={state.language === 'zh' ? '选择模型' : 'Choose models'}><Cpu size={14} /><span className="hidden sm:inline">{state.language === 'zh' ? '模型' : 'Models'}</span><ChevronDown size={12} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60"><DropdownMenuLabel>{state.language === 'zh' ? '分析模型' : 'Analysis model'}</DropdownMenuLabel><DropdownMenuRadioGroup value={state.analysisModel} onValueChange={value => { setAnalysisModel(value as AnalysisModel); setModelDropdownOpen(false); }}>{analysisModels.map(model => <DropdownMenuRadioItem key={model.id} value={model.id}>{model.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuLabel>{state.language === 'zh' ? '生图模型' : 'Image model'}</DropdownMenuLabel><DropdownMenuRadioGroup value={state.generationModel} onValueChange={value => { setGenerationModel(value as GenerationModel); setModelDropdownOpen(false); }}>{generationModels.map(model => <DropdownMenuRadioItem key={model.id} value={model.id}>{model.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>
            <Button aria-label={t.reset} variant="ghost"
              onClick={resetApp}
              className={cn("h-auto", "p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-muted/80 transition-colors")}
              title={t.reset}
            >
              <RotateCcw size={16} />
            </Button>
            <div className="relative">
              <Button aria-label={state.language === 'zh' ? '生成记录' : 'History'} variant="ghost"
                onClick={() => setHistoryOpen(!historyOpen)}
                className={cn("h-auto", "flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-muted/80 text-sm font-medium text-muted-foreground transition-colors")}
                title={state.language === 'zh' ? '生成记录' : 'History'}
              >
                <History size={14} />
                <span className="hidden sm:inline">{state.language === 'zh' ? '记录' : 'History'}</span>
                {costSummary.total > 0 && (
                  <span className="text-[10px] bg-accent text-primary px-1.5 py-0.5 rounded-full font-bold">
                    预估 ¥{costSummary.total.toFixed(2)}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <TabsContent value={state.mode} className="mt-0 grid grid-cols-1 lg:grid-cols-12 gap-5 h-auto lg:h-full">
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
        </TabsContent>
      </div>

      <GenerationHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        language={state.language}
        costSummary={costSummary}
        savedImages={savedImages}
        imagesTotal={imagesTotal}
        onLoadImages={loadSavedImages}
        onDeleteImage={handleDeleteSavedImage}
        records={records}
        recordsTotal={recordsTotal}
        onLoadRecords={loadRecords}
      />
    </Tabs>
  );
};
