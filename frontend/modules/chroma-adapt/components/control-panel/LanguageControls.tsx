
import React from 'react';
import { Wand2, Loader2, Upload, Images } from 'lucide-react';
import { ChromaAppState, ProcessingState, TranslationTarget, TargetFont } from '../../chromaTypes';

interface LanguageControlsProps {
  state: ChromaAppState;
  t: any;
  targetLanguages: { code: TranslationTarget; label: string }[];
  fontOptions: { code: TargetFont; label: string }[];
  onTranslationTargetChange: (target: TranslationTarget) => void;
  onTargetFontChange?: (font: TargetFont) => void;
  onGenerate: () => void;
  onPipelineBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBatchTranslateStart?: () => void;
}

const LanguageControls: React.FC<LanguageControlsProps> = ({
  state,
  t,
  targetLanguages,
  fontOptions,
  onTranslationTargetChange,
  onTargetFontChange,
  onGenerate,
  onPipelineBatchUpload,
  onBatchTranslateStart
}) => {
  const isProcessing = state.status === ProcessingState.GENERATING || state.status === ProcessingState.ANALYZING;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{t.targetStep}</span>
          <h2 className="text-sm font-bold text-slate-800">{t.targetLanguage}</h2>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {targetLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => onTranslationTargetChange(lang.code)}
              disabled={isProcessing}
              className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                state.translationTarget === lang.code
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/25'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300 hover:text-brand-600'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {onTargetFontChange && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{t.fontStep}</span>
            <h2 className="text-sm font-bold text-slate-800">{t.fontStyle}</h2>
          </div>
          <div className="flex gap-1.5">
            {fontOptions.map((font) => (
              <button
                key={font.code}
                onClick={() => onTargetFontChange(font.code)}
                disabled={isProcessing}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                  state.targetFont === font.code
                    ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/25'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300 hover:text-brand-600'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{t.translateStep}</span>
          <h2 className="text-sm font-bold text-slate-800">{t.translateAction}</h2>
        </div>

        <div className="space-y-2">
          <button
            onClick={onGenerate}
            disabled={isProcessing || !state.posterImage}
            className={`group w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 ${
              (!isProcessing && state.posterImage)
                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 active:scale-[0.98]'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {state.status === ProcessingState.GENERATING ? <Loader2 className="animate-spin w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
            1. {t.translate}
          </button>

          {onPipelineBatchUpload && (
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onPipelineBatchUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isProcessing}
              />
              <button
                disabled={isProcessing}
                className="group w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 bg-white text-slate-500 border-2 border-dashed border-slate-200 hover:border-brand-300 hover:text-brand-600 disabled:opacity-40"
              >
                <Upload className="w-4 h-4" />
                {t.batchUpload || 'Batch Upload'}
              </button>
            </div>
          )}

          {onBatchTranslateStart && state.pipelineQueue.length > 0 && (
            <button
              onClick={onBatchTranslateStart}
              disabled={isProcessing}
              className={`group w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 ${
                !isProcessing
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 active:scale-[0.98]'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Images className="w-4 h-4" />}
              2. {t.batchTranslate || 'Batch Translate'} ({state.pipelineQueue.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LanguageControls;
