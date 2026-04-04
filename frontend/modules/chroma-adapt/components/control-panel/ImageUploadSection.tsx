import React from 'react';
import { Upload, XCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { ChromaAppState, ProcessingState } from '../../chromaTypes';
import HelpTooltip from '../HelpTooltip';

interface ImageUploadSectionProps {
  state: ChromaAppState;
  t: any;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'poster' | 'reference') => void;
  onRemoveImage: (type: 'poster' | 'reference', e: React.MouseEvent) => void;
  showReferenceUpload: boolean;
}

const helpContent: Record<string, { title: string; content: string }> = {
  editImage: {
    title: '待修改图片',
    content: '上传您需要修改的原始图片。\n\n支持 JPG、PNG、WebP 格式。图片将作为 AI 编辑的基础，建议使用清晰的高分辨率图片以获得最佳效果。'
  },
  editRef: {
    title: '参考元素图（可选）',
    content: '上传一张参考图片，AI 将参考其中的元素风格进行修改。\n\n例如：想让背景换成某种风格，可以上传一张该风格参考图。\n此为可选项，不上传也不影响使用。'
  },
  sourceImage: {
    title: '参考底图',
    content: '上传一张参考底图，AI 将基于此图生成新的副图。\n\n建议使用清晰的产品图或场景图，AI 会根据您的提示词在此基础上进行创作。'
  },
  originalPoster: {
    title: '原始海报',
    content: '上传需要翻译的原始海报图片。\n\nAI 会自动识别图片中的文字内容，并将其翻译为您选择的目标语言，同时保留原始排版和字体风格。'
  },
  colorPoster: {
    title: '原始海报',
    content: '上传需要换色的原始海报图片。\n\nAI 会自动分析图片的色彩方案，提取主色、辅助色和点缀色。'
  },
  colorRef: {
    title: '色调参考图',
    content: '上传目标色调的参考图片。\n\nAI 会提取参考图中的色彩风格，并将其应用到原始海报上。例如：想让海报变成暖色调，可以上传一张暖色调的图片作为参考。'
  }
};

const ImageUploadSection: React.FC<ImageUploadSectionProps> = ({
  state,
  t,
  onFileUpload,
  onRemoveImage,
  showReferenceUpload
}) => {
  const getPosterLabel = () => {
    if (state.mode === 'IMAGE_EDIT') return t.editImage;
    if (state.mode === 'SECONDARY_GENERATION') return t.sourceImage;
    if (state.mode === 'COLOR_ADAPT') return t.originalPoster;
    return t.originalPoster;
  };

  const getReferenceLabel = () => {
    if (state.mode === 'IMAGE_EDIT') return t.editRef;
    if (state.mode === 'COLOR_ADAPT') return t.productRef;
    return t.productRef;
  };

  const getPosterHelpKey = () => {
    if (state.mode === 'IMAGE_EDIT') return 'editImage';
    if (state.mode === 'SECONDARY_GENERATION') return 'sourceImage';
    if (state.mode === 'COLOR_ADAPT') return 'colorPoster';
    return 'originalPoster';
  };

  const getReferenceHelpKey = () => {
    if (state.mode === 'IMAGE_EDIT') return 'editRef';
    return 'colorRef';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{t.assetsStep}</span>
        <h2 className="text-sm font-bold text-slate-800">{t.assets}</h2>
      </div>

      <div className={`grid gap-3 ${showReferenceUpload ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="relative h-36 group">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFileUpload(e, 'poster')}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={state.status === ProcessingState.GENERATING || !!state.posterImage}
          />
          <div className={`h-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-3 transition-all duration-200 overflow-hidden ${
            state.posterImage
              ? 'border-brand-400 bg-brand-50/50'
              : 'border-slate-200 hover:border-brand-300 bg-white hover:bg-brand-50/30'
          }`}>
            {state.posterImage ? (
              <div className="relative w-full h-full">
                <img src={state.posterImage} alt="Poster" className="h-full w-full object-contain rounded-lg" />
                <button
                  onClick={(e) => onRemoveImage('poster', e)}
                  className="absolute top-1 right-1 p-1.5 bg-white/90 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors z-20 shadow-sm"
                >
                  <XCircle size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                  <Upload className="text-slate-400" size={18} />
                </div>
                <span className="text-xs font-semibold text-slate-500 text-center leading-tight">{getPosterLabel()}</span>
              </>
            )}
          </div>
          <div className="absolute top-2 right-2 z-30">
            <HelpTooltip {...helpContent[getPosterHelpKey()]} />
          </div>
        </div>

        {showReferenceUpload && (
          <div className="relative h-36 group">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onFileUpload(e, 'reference')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={state.status === ProcessingState.GENERATING || !!state.referenceImage}
            />
            <div className={`h-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-3 transition-all duration-200 overflow-hidden relative ${
              state.referenceImage
                ? 'border-brand-400 bg-brand-50/50'
                : 'border-slate-200 hover:border-brand-300 bg-white hover:bg-brand-50/30'
            }`}>
              {state.status === ProcessingState.ANALYZING && state.mode === 'COLOR_ADAPT' && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center flex-col gap-1.5 rounded-2xl">
                  <Loader2 className="animate-spin text-brand-500 w-5 h-5" />
                  <span className="text-[10px] font-medium text-brand-500">{t.analyzing}</span>
                </div>
              )}
              {state.referenceImage ? (
                <div className="relative w-full h-full">
                  <img src={state.referenceImage} alt="Ref" className="h-full w-full object-contain rounded-lg" />
                  <button
                    onClick={(e) => onRemoveImage('reference', e)}
                    className="absolute top-1 right-1 p-1.5 bg-white/90 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors z-20 shadow-sm"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                    <ImageIcon className="text-slate-400" size={18} />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 text-center leading-tight">{getReferenceLabel()}</span>
                </>
              )}
            </div>
            <div className="absolute top-2 right-2 z-30">
              <HelpTooltip {...helpContent[getReferenceHelpKey()]} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploadSection;
