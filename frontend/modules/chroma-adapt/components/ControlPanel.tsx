
import React from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { ChromaAppState, ProcessingState, TranslationTarget, StyleConfig, TargetFont, SecondaryWorkflowMode, ColorWorkflowMode } from '../chromaTypes';
import { getTranslation } from '../utils/translations';
import ColorPaletteDisplay from './ColorPaletteDisplay';
import StyleControls from './StyleControls';
import ImageUploadSection from './control-panel/ImageUploadSection';
import LanguageControls from './control-panel/LanguageControls';
import EditPromptSection from './control-panel/EditPromptSection';


interface ControlPanelProps {
  state: ChromaAppState;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'poster' | 'reference') => void;
  onRemoveImage: (type: 'poster' | 'reference', e: React.MouseEvent) => void;
  onStyleChange: (key: keyof StyleConfig) => void;
  onTranslationTargetChange: (target: TranslationTarget) => void;
  onGenerate: () => void;
  onAnalyzeSecondary?: () => void;
  onAnalyzeColorAdapt?: () => void;
  onAnalyzeEdit?: () => void;
  onTargetFontChange?: (font: TargetFont) => void;
  onEditPromptChange?: (val: string) => void;
  onEditUserInputChange?: (val: string) => void;
  onPipelineBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBatchTranslateStart?: () => void;
  onConcurrentCountChange?: (count: number) => void;
  onSecondaryBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSecondaryBatchGenerate?: () => void;
  onRemoveSecondaryBatchItem?: (id: string) => void;
  onClearSecondaryBatch?: () => void;
  onSecondaryWorkflowModeChange?: (mode: SecondaryWorkflowMode) => void;
  onColorWorkflowModeChange?: (mode: ColorWorkflowMode) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  state,
  onFileUpload,
  onRemoveImage,
  onStyleChange,
  onTranslationTargetChange,
  onGenerate,
  onAnalyzeSecondary,
  onAnalyzeColorAdapt,
  onAnalyzeEdit,
  onTargetFontChange,
  onEditPromptChange,
  onEditUserInputChange,
  onPipelineBatchUpload,
  onBatchTranslateStart,
  onConcurrentCountChange,
  onSecondaryBatchUpload,
  onSecondaryBatchGenerate,
  onRemoveSecondaryBatchItem,
  onClearSecondaryBatch,
  onSecondaryWorkflowModeChange,
  onColorWorkflowModeChange
}) => {
  const t = getTranslation(state.language);

  const targetLanguages: { code: TranslationTarget; label: string }[] = [
    { code: 'zh', label: t.langZh },
    { code: 'en', label: t.langEn },
    { code: 'ja', label: t.langJa },
    { code: 'ko', label: t.langKo },
    { code: 'fr', label: t.langFr },
    { code: 'de', label: t.langDe },
    { code: 'es', label: t.langEs },
    { code: 'ms', label: t.langMs },
    { code: 'tl', label: t.langTl },
    { code: 'th', label: t.langTh },
  ];

  const fontOptions: { code: TargetFont; label: string }[] = [
    { code: 'original', label: t.fontOriginal },
    { code: 'sans_serif', label: t.fontSans },
    { code: 'serif', label: t.fontSerif },
    { code: 'handwritten', label: t.fontHand },
    { code: 'bold_display', label: t.fontBold },
  ];

  const showReferenceUpload = state.mode === 'COLOR_ADAPT' || state.mode === 'IMAGE_EDIT';
  const showPalette = state.mode === 'COLOR_ADAPT';
  const showStyleConfig = state.mode === 'COLOR_ADAPT';
  const showLanguageConfig = state.mode === 'TRANSLATION';
  const hasBatchQueue = state.mode === 'TRANSLATION' && state.pipelineQueue.length > 0;

  const getGenerateButtonLabel = () => {
    if (state.mode === 'COLOR_ADAPT') {
      return state.concurrentCount > 1 ? `${t.generateCount}${state.concurrentCount}` : t.generate;
    }
    if (state.mode === 'IMAGE_EDIT') return t.startEdit;
    if (state.mode === 'SECONDARY_GENERATION') return "2. Generate Image";
    if (state.mode === 'TRANSLATION') return "2. Translate";
    return t.translate;
  };

  return (
    <div className="lg:col-span-5 h-full flex flex-col min-h-0 pt-2">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-6 custom-scrollbar scroll-smooth">
        <>
          {/* Step 1: Uploads (hidden if batch queue is active in Translation mode) */}
          {!hasBatchQueue && (
            <ImageUploadSection
              state={state}
              t={t}
              onFileUpload={onFileUpload}
              onRemoveImage={onRemoveImage}
              showReferenceUpload={showReferenceUpload}
            />
          )}

          {/* Steps 2 & 3 */}
          {showPalette && (
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-800 flex items-center gap-2 mb-3 sticky top-0 bg-slate-50/80 backdrop-blur-md py-2 z-10 border-b border-slate-200/50">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-brand-100/80 text-brand-700 text-[10px] ring-1 ring-brand-200/50">{t.paletteStep}</span>
                {t.extractedPalette}
              </h2>
              <div className="w-full">
                <ColorPaletteDisplay
                  palette={state.extractedPalette}
                  isLoading={state.status === ProcessingState.ANALYZING}
                  lang={state.language}
                />
              </div>
            </div>
          )}

          {showStyleConfig && (
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-800 flex items-center gap-2 mb-3 sticky top-0 bg-slate-50/80 backdrop-blur-md py-2 z-10 border-b border-slate-200/50">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-brand-100/80 text-brand-700 text-[10px] ring-1 ring-brand-200/50">{t.configStep}</span>
                {t.configuration}
              </h2>
              <StyleControls
                config={state.styleConfig}
                onChange={onStyleChange}
                disabled={state.status === ProcessingState.GENERATING}
                lang={state.language}
              />
            </div>
          )}

          {showLanguageConfig && (
            <LanguageControls
              state={state}
              t={t}
              targetLanguages={targetLanguages}
              fontOptions={fontOptions}
              onTranslationTargetChange={onTranslationTargetChange}
              onTargetFontChange={onTargetFontChange}
              onGenerate={onGenerate}
              onPipelineBatchUpload={onPipelineBatchUpload}
              onBatchTranslateStart={onBatchTranslateStart}
            />
          )}

          {/* Edit Prompt & Secondary Gen UI */}
          <EditPromptSection
            state={state}
            t={t}
            onEditPromptChange={onEditPromptChange}
            onEditUserInputChange={onEditUserInputChange}
            onAnalyzeSecondary={onAnalyzeSecondary}
            onAnalyzeColorAdapt={onAnalyzeColorAdapt}
            onAnalyzeEdit={onAnalyzeEdit}
            onSecondaryBatchUpload={onSecondaryBatchUpload}
            onSecondaryBatchGenerate={onSecondaryBatchGenerate}
            onRemoveSecondaryBatchItem={onRemoveSecondaryBatchItem}
            onClearSecondaryBatch={onClearSecondaryBatch}
            onSecondaryWorkflowModeChange={onSecondaryWorkflowModeChange}
            onColorWorkflowModeChange={onColorWorkflowModeChange}
          />

          {/* Concurrent Count (COLOR_ADAPT only) */}
          {state.mode === 'COLOR_ADAPT' && (
            <div className="mb-4 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-display font-semibold text-slate-700">{t.concurrentCount}</label>
                  <span className="text-xs text-slate-400">{t.concurrentCountDesc}</span>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => onConcurrentCountChange?.(n)}
                      disabled={state.status === ProcessingState.GENERATING}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 border ${state.concurrentCount === n
                        ? 'bg-gradient-to-r from-brand-500 to-indigo-500 text-white border-brand-400/50 shadow-lg shadow-brand-500/20 scale-105'
                        : 'bg-white/60 text-slate-600 border-slate-200/60 hover:bg-white hover:border-brand-300 hover:text-brand-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      ×{n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Generate Action */}
          {!hasBatchQueue && state.mode !== 'TRANSLATION' && (() => {
            const hasSecondaryBatch = state.mode === 'SECONDARY_GENERATION' && state.secondaryBatchQueue.length > 0;
            const batchLabel = hasSecondaryBatch
              ? `${t.batchGenerate} (${state.secondaryBatchQueue.length})`
              : getGenerateButtonLabel();
            const handleClick = hasSecondaryBatch ? () => onSecondaryBatchGenerate?.() : onGenerate;
            const isDisabled = hasSecondaryBatch
              ? state.status === ProcessingState.GENERATING
              : (
                state.mode === 'COLOR_ADAPT'
                  ? (state.status !== ProcessingState.READY && state.status !== ProcessingState.COMPLETE)
                  : (
                    (!state.posterImage || (state.mode === 'IMAGE_EDIT' && !state.editPrompt))
                    || state.status === ProcessingState.GENERATING
                  )
              );
            const isActive = !isDisabled;

            return (
              <button
                onClick={handleClick}
                disabled={isDisabled}
                className={`group relative w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-display font-bold text-base shadow-xl transition-all duration-300 transform active:scale-95 overflow-hidden ${isActive
                  ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white hover:shadow-brand-500/40 hover:-translate-y-0.5 border border-white/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/50'
                  }`}
              >
                {isActive && (
                  <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"></div>
                )}
                {state.status === ProcessingState.GENERATING ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" /> {t.processing}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" /> {batchLabel}
                  </>
                )}
              </button>
            );
          })()}
        </>
      </div>
    </div>
  );
};

export default ControlPanel;
