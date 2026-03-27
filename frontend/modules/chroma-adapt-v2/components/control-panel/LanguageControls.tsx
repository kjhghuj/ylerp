
import React from 'react';
import { Languages, Type, Loader2, Upload, Globe2 } from 'lucide-react';
import { ChromaV2AppState, TranslationTarget, TargetFont, ProcessingState } from '../../chromaV2Types';

interface LanguageControlsProps {
  state: ChromaV2AppState;
  t: any;
  targetLanguages: { code: TranslationTarget; label: string }[];
  fontOptions: { code: TargetFont; label: string }[];
  onTranslationTargetChange: (target: TranslationTarget) => void;
  onGenerate: () => void;
  onTargetFontChange?: (font: TargetFont) => void;
  onPipelineBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBatchTranslateStart?: () => void;
}

const LanguageControls: React.FC<LanguageControlsProps> = ({
  state,
  t,
  targetLanguages,
  fontOptions,
  onTranslationTargetChange,
  onGenerate,
  onTargetFontChange,
  onPipelineBatchUpload,
  onBatchTranslateStart
}) => {
  const isZh = state.language === 'zh';
  const hasBatchQueue = state.pipelineQueue.length > 0;
  const isGenerating = state.status === ProcessingState.GENERATING;
  const hasPosterImage = state.mode === 'TRANSLATION' && !!state.posterImage;

  return (
    <div>
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-2 sticky top-0 bg-slate-50 py-1 z-10">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px]">{t.paletteStep}</span>
        {t.targetLang}
      </h2>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Languages size={14} className="text-brand-600" /> {t.targetLang}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {targetLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => onTranslationTargetChange(lang.code)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border text-left transition-all ${state.translationTarget === lang.code ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Type size={14} className="text-brand-600" /> {t.fontStyle}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {fontOptions.map((font) => (
                <button
                  key={font.code}
                  onClick={() => onTargetFontChange && onTargetFontChange(font.code)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border text-left transition-all truncate ${state.targetFont === font.code ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  title={font.label}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
          
          {hasPosterImage && !hasBatchQueue && (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-base shadow-lg transition-all ${
                !isGenerating
                  ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white hover:shadow-brand-500/40 hover:-translate-y-0.5'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isGenerating ? <Loader2 className="animate-spin" /> : <Globe2 size={20} />}
              {isZh ? '开始翻译' : 'Start Translation'}
            </button>
          )}

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-slate-800 flex justify-between">
                <span>{t.batchTranslatePostersDesc}</span>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{state.pipelineQueue.length} / 12</span>
              </h2>
              <div className="relative h-20 group">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onPipelineBatchUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={isGenerating || state.pipelineQueue.length >= 12}
                />
                <div className="h-full rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-400 bg-white flex flex-col items-center justify-center p-2 transition-all">
                  <Upload className="text-slate-400 mb-1" size={18} />
                  <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{t.uploadMultiple}</span>
                </div>
              </div>
            </div>

            {hasBatchQueue && (
              <button
                onClick={onBatchTranslateStart}
                disabled={isGenerating}
                className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-base shadow-lg transition-all ${
                  !isGenerating
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white hover:shadow-brand-500/40 hover:-translate-y-0.5'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isGenerating ? <Loader2 className="animate-spin" /> : <Globe2 size={20} />}
                {t.startBatchTranslate}
              </button>
            )}
          </div>
      </div>
    </div>
  );
};

export default LanguageControls;
