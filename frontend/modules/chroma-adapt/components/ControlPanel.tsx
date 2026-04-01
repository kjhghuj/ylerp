
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
    <div className="lg:col-span-5 h-full flex flex-col min-h-0 pt-1">
      <div className="flex-1 overflow-y-auto pr-1 pb-4 space-y-4 custom-scrollbar scroll-smooth">
        <>
          {!hasBatchQueue && (
            <ImageUploadSection
              state={state}
              t={t}
              onFileUpload={onFileUpload}
              onRemoveImage={onRemoveImage}
              showReferenceUpload={showReferenceUpload}
            />
          )}

          {showPalette && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{t.paletteStep}</span>
                <h2 className="text-sm font-bold text-slate-800">{t.extractedPalette}</h2>
              </div>
              <ColorPaletteDisplay
                palette={state.extractedPalette}
                isLoading={state.status === ProcessingState.ANALYZING}
                lang={state.language}
              />
            </div>
          )}

          {showStyleConfig && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{t.configStep}</span>
                <h2 className="text-sm font-bold text-slate-800">{t.configuration}</h2>
              </div>
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

          {state.mode === 'COLOR_ADAPT' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700">{t.concurrentCount}</label>
                <span className="text-[10px] text-slate-400">{t.concurrentCountDesc}</span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => onConcurrentCountChange?.(n)}
                    disabled={state.status === ProcessingState.GENERATING}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                      state.concurrentCount === n
                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                        : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300 hover:text-brand-600'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    ×{n}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                className={`group relative w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 transform active:scale-[0.98] overflow-hidden ${
                  isActive
                    ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {state.status === ProcessingState.GENERATING ? (
                  <>
                    <Loader2 className="animate-spin w-4 h-4" /> {t.processing}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" /> {batchLabel}
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
