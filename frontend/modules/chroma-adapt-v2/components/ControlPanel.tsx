import React from 'react';
import { ChromaV2AppState, StyleConfig, ProcessingState, TranslationTarget, TargetFont, SecondaryWorkflowMode, ColorWorkflowMode } from '../chromaV2Types';
import ImageUploadSection from './control-panel/ImageUploadSection';
import EditPromptSection from './control-panel/EditPromptSection';
import LanguageControls from './control-panel/LanguageControls';
import StyleControls from './StyleControls';
import ColorPaletteDisplay from './ColorPaletteDisplay';
import { Plus, Loader2, RefreshCw, Settings2 } from 'lucide-react';

interface ControlPanelProps {
  state: ChromaV2AppState;
  t: any;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'poster' | 'reference') => void;
  onRemoveImage: (type: 'poster' | 'reference', e: React.MouseEvent) => void;
  onStyleChange: (key: keyof StyleConfig) => void;
  onGenerate: () => void;
  onEditPromptChange?: (val: string) => void;
  onEditUserInputChange?: (val: string) => void;
  onTranslationTargetChange?: (target: TranslationTarget) => void;
  onTargetFontChange?: (font: TargetFont) => void;
  onAnalyzeSecondary?: () => void;
  onAnalyzeEdit?: () => void;
  onAnalyzeColorAdapt?: () => void;
  onSecondaryWorkflowModeChange?: (mode: SecondaryWorkflowMode) => void;
  onColorWorkflowModeChange?: (mode: ColorWorkflowMode) => void;
  onPipelineBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBatchTranslateStart?: () => void;
  onSecondaryBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSecondaryBatchGenerate?: () => void;
  onRemoveSecondaryBatchItem?: (id: string) => void;
  onClearSecondaryBatch?: () => void;
  onAnalysisModelChange?: (model: any) => void;
  onGenerationModelChange?: (model: any) => void;
  onConcurrentCountChange?: (count: number) => void;
  onRemovePipelineItem?: (id: string) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  state,
  t,
  onFileUpload,
  onRemoveImage,
  onStyleChange,
  onGenerate,
  onEditPromptChange,
  onEditUserInputChange,
  onTranslationTargetChange,
  onTargetFontChange,
  onAnalyzeSecondary,
  onAnalyzeEdit,
  onAnalyzeColorAdapt,
  onSecondaryWorkflowModeChange,
  onColorWorkflowModeChange,
  onPipelineBatchUpload,
  onBatchTranslateStart,
  onSecondaryBatchUpload,
  onSecondaryBatchGenerate,
  onRemoveSecondaryBatchItem,
  onClearSecondaryBatch,
  onAnalysisModelChange,
  onGenerationModelChange,
  onConcurrentCountChange,
  onRemovePipelineItem
}) => {
  const isZh = state.language === 'zh';
  const isGenerating = state.status === ProcessingState.GENERATING;
  const isAnalyzing = state.status === ProcessingState.ANALYZING;
  const isBusy = isGenerating || isAnalyzing;
  const showReferenceUpload = state.mode === 'COLOR_ADAPT';
  const isReady = state.status === ProcessingState.READY || state.status === ProcessingState.COMPLETE;

  const canGenerate = isReady && state.posterImage;
  const targetLanguages = [
    { code: 'zh' as TranslationTarget, label: t.langZh },
    { code: 'en' as TranslationTarget, label: t.langEn },
    { code: 'ja' as TranslationTarget, label: t.langJa },
    { code: 'ko' as TranslationTarget, label: t.langKo },
    { code: 'fr' as TranslationTarget, label: t.langFr },
    { code: 'de' as TranslationTarget, label: t.langDe },
    { code: 'es' as TranslationTarget, label: t.langEs },
    { code: 'ms' as TranslationTarget, label: t.langMs },
    { code: 'tl' as TranslationTarget, label: t.langTl },
    { code: 'th' as TranslationTarget, label: t.langTh },
  ].filter(item => item.code);

  const fontOptions = [
    { code: 'original' as TargetFont, label: t.fontOriginal },
    { code: 'sans_serif' as TargetFont, label: t.fontSans },
    { code: 'serif' as TargetFont, label: t.fontSerif },
    { code: 'handwritten' as TargetFont, label: t.fontHand },
    { code: 'bold_display' as TargetFont, label: t.fontBold },
  ];

  const analysisModels = [
    { key: 'doubao-seed-2-0-lite', label: 'Seed 2.0 Lite' },
    { key: 'doubao-seed-2-0-mini', label: 'Seed 2.0 Mini' },
    { key: 'doubao-seed-2-0-pro', label: 'Seed 2.0 Pro' },
    { key: 'doubao-vision', label: 'Vision' },
  ];

  const generationModels = [
    { key: 'doubao-seedream-5.0-lite', label: 'Seedream 5.0 Lite' },
    { key: 'doubao-seedream-4.5', label: 'Seedream 4.5' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
      <ImageUploadSection
        state={state}
        t={t}
        onFileUpload={onFileUpload}
        onRemoveImage={onRemoveImage}
        showReferenceUpload={showReferenceUpload}
      />

      {state.extractedPalette && state.mode !== 'COLOR_ADAPT' && (
        <ColorPaletteDisplay palette={state.extractedPalette} label={t.extractedPalette} />
      )}

      {state.mode === 'COLOR_ADAPT' && (
        <StyleControls
          styleConfig={state.styleConfig}
          t={t}
          onStyleChange={onStyleChange}
          disabled={isBusy}
        />
      )}

      {state.mode === 'TRANSLATION' && (
        <LanguageControls
          state={state}
          t={t}
          targetLanguages={targetLanguages}
          fontOptions={fontOptions}
          onTranslationTargetChange={onTranslationTargetChange!}
          onGenerate={onGenerate}
          onTargetFontChange={onTargetFontChange}
          onPipelineBatchUpload={onPipelineBatchUpload}
          onBatchTranslateStart={onBatchTranslateStart}
        />
      )}

      <EditPromptSection
        state={state}
        t={t}
        onEditPromptChange={onEditPromptChange}
        onEditUserInputChange={onEditUserInputChange}
        onAnalyzeSecondary={onAnalyzeSecondary}
        onAnalyzeEdit={onAnalyzeEdit}
        onSecondaryBatchUpload={onSecondaryBatchUpload}
        onSecondaryBatchGenerate={onSecondaryBatchGenerate}
        onRemoveSecondaryBatchItem={onRemoveSecondaryBatchItem}
        onClearSecondaryBatch={onClearSecondaryBatch}
        onSecondaryWorkflowModeChange={onSecondaryWorkflowModeChange}
        onAnalyzeColorAdapt={onAnalyzeColorAdapt}
        onColorWorkflowModeChange={onColorWorkflowModeChange}
      />

      {(state.mode === 'COLOR_ADAPT' || state.mode === 'IMAGE_EDIT' || state.mode === 'SECONDARY_GENERATION') && canGenerate && (
        <div className="space-y-3">
          <button
            onClick={onGenerate}
            disabled={isBusy}
            className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-base shadow-lg transition-all ${!isBusy
                ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white hover:shadow-brand-500/40 hover:-translate-y-0.5'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
          >
            {isBusy ? (
              <>
                <Loader2 className="animate-spin" />
                {t.processing}
              </>
            ) : (
              <>
                <Plus size={20} />
                {state.mode === 'COLOR_ADAPT' ? t.generate :
                  state.mode === 'IMAGE_EDIT' ? t.startEdit :
                    t.startSecondary}
              </>
            )}
          </button>
        </div>
      )}

      {state.mode === 'SECONDARY_GENERATION' && state.secondaryBatchQueue.length > 0 && (
        <button
          onClick={onSecondaryBatchGenerate}
          disabled={isBusy || state.secondaryBatchQueue.length === 0}
          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-base shadow-lg transition-all ${!isBusy && state.secondaryBatchQueue.length > 0
              ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white hover:shadow-brand-500/40 hover:-translate-y-0.5'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
        >
          {isBusy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Settings2 size={20} />
          )}
          {t.batchGenerate} ({state.secondaryBatchQueue.length})
        </button>
      )}

      <div className="space-y-3 pt-2 border-t border-slate-200">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Settings2 size={12} /> {isZh ? '模型选择' : 'Model Selection'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-medium">{isZh ? '分析模型' : 'Analysis'}</label>
              <select
                value={state.analysisModel}
                onChange={(e) => onAnalysisModelChange?.(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-brand-500"
              >
                {analysisModels.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-medium">{isZh ? '生成模型' : 'Generation'}</label>
              <select
                value={state.generationModel}
                onChange={(e) => onGenerationModelChange?.(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-brand-500"
              >
                {generationModels.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {state.mode === 'COLOR_ADAPT' && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t.concurrentCount}</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => onConcurrentCountChange?.(n)}
                  disabled={isBusy}
                  className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${state.concurrentCount === n
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                >
                  ×{n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">{t.concurrentCountDesc}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
