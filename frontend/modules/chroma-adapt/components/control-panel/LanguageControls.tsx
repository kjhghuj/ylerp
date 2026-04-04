import React from 'react';
import { Wand2, Loader2, Upload, Images } from 'lucide-react';
import { ChromaAppState, ProcessingState, TranslationTarget, TargetFont } from '../../chromaTypes';
import HelpTooltip from '../HelpTooltip';

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

const helpContent: Record<string, { title: string; content: string }> = {
  targetLanguage: {
    title: '目标语言',
    content: '选择您希望将海报中的文字翻译成的目标语言。\n\nAI 会自动识别原始图片中的文字语言，并将其翻译为您选择的目标语言，同时尽量保持原始字体风格和排版布局。'
  },
  fontStyle: {
    title: '字体风格',
    content: '选择翻译后文字的字体风格。\n\n不同风格适用于不同场景：\n• 手写体：适合温馨、个性化的设计\n• 衬线体：适合正式、优雅的海报\n• 无衬线体：适合现代、简洁的设计\n• 像素风：适合复古、游戏相关主题\n• 萌系：适合可爱、年轻化的风格'
  },
  translate: {
    title: '翻译生成',
    content: '点击后 AI 将执行以下步骤：\n\n1. 识别原始图片中的所有文字\n2. 将文字翻译为目标语言\n3. 使用选择的字体风格重新渲染\n4. 将翻译后的文字替换回原图对应位置\n\n首次处理可能需要 10-30 秒。'
  },
  batchUpload: {
    title: '批量上传',
    content: '一次上传多张图片进行批量翻译。\n\n使用步骤：\n1. 点击"批量上传"选择多张图片\n2. 等待图片加载到队列\n3. 点击"批量翻译"开始处理\n\n所有图片将使用相同的目标语言和字体设置。'
  },
  batchTranslate: {
    title: '批量翻译',
    content: '开始批量处理队列中的所有图片。\n\n每张图片会依次处理，处理完成后可在结果区域查看和下载。处理速度取决于图片数量和复杂度。'
  }
};

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
          <HelpTooltip {...helpContent.targetLanguage} />
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
            <HelpTooltip {...helpContent.fontStyle} />
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
          <HelpTooltip {...helpContent.translate} />
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
                <span className="ml-1"><HelpTooltip {...helpContent.batchUpload} /></span>
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
              <span className="ml-1"><HelpTooltip {...helpContent.batchTranslate} /></span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LanguageControls;
