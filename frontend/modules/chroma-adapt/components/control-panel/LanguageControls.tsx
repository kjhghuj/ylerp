import { Input } from '../../../../components/ui/input';
import { cn } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/button';
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
          <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold">{t.targetStep}</span>
          <h2 className="text-sm font-bold text-foreground">{t.targetLanguage}</h2>
          <HelpTooltip {...helpContent.targetLanguage} />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {targetLanguages.map((lang) => (
            <Button variant={state.translationTarget === lang.code ? "default" : "outline"}
              key={lang.code} aria-pressed={state.translationTarget === lang.code}
              onClick={() => onTranslationTargetChange(lang.code)}
              disabled={isProcessing}
              className={cn("h-auto min-w-0 whitespace-normal break-words px-2", `py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                state.translationTarget === lang.code
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-none'
                  : 'bg-card text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
              } disabled:opacity-40 disabled:cursor-not-allowed`)}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </div>

      {onTargetFontChange && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold">{t.fontStep}</span>
            <h2 className="text-sm font-bold text-foreground">{t.fontStyle}</h2>
            <HelpTooltip {...helpContent.fontStyle} />
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
            {fontOptions.map((font) => (
              <Button variant={state.targetFont === font.code ? "default" : "outline"}
                key={font.code} aria-pressed={state.targetFont === font.code}
                onClick={() => onTargetFontChange(font.code)}
                disabled={isProcessing}
                className={cn("h-auto min-w-0 whitespace-normal break-words px-2", `py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                  state.targetFont === font.code
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-none'
                    : 'bg-card text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
                } disabled:opacity-40 disabled:cursor-not-allowed`)}
              >
                {font.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold">{t.translateStep}</span>
          <h2 className="text-sm font-bold text-foreground">{t.translateAction}</h2>
          <HelpTooltip {...helpContent.translate} />
        </div>

        <div className="space-y-2">
          <Button variant={(!isProcessing && state.posterImage) ? "default" : "outline"}
            onClick={onGenerate}
            disabled={isProcessing || !state.posterImage}
            className={cn("h-auto", `group w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 ${
              (!isProcessing && state.posterImage)
                ? 'bg-primary text-primary-foreground hover:bg-primary shadow-lg shadow-none active:scale-[0.98]'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`)}
          >
            {state.status === ProcessingState.GENERATING ? <Loader2 className="animate-spin w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
            1. {t.translate}
          </Button>

          {onPipelineBatchUpload && (
            <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                type="file"
                accept="image/*"
                multiple
                aria-label={t.batchUpload} onChange={onPipelineBatchUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isProcessing}
              />
              <Button variant="ghost"
                disabled={isProcessing}
                className={cn("h-auto", "group w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 bg-card text-muted-foreground border-2 border-dashed border-border hover:border-primary/30 hover:text-primary disabled:opacity-40")}
              >
                <Upload className="w-4 h-4" />
                {t.batchUpload || 'Batch Upload'}

              </Button>
            </div>
              <HelpTooltip {...helpContent.batchUpload} />
            </div>
          )}

          {onBatchTranslateStart && state.pipelineQueue.length > 0 && (
            <div className="flex items-center gap-2">
<Button variant={!isProcessing ? "default" : "outline"}
              onClick={onBatchTranslateStart}
              disabled={isProcessing}
              className={cn("h-auto min-w-0 whitespace-normal", `group w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 ${
                !isProcessing
                  ? 'bg-primary text-primary-foreground hover:bg-primary shadow-lg shadow-none active:scale-[0.98]'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`)}
            >
              {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Images className="w-4 h-4" />}
              2. {t.batchTranslate || 'Batch Translate'} ({state.pipelineQueue.length})
</Button>
<HelpTooltip {...helpContent.batchTranslate} />
</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LanguageControls;
