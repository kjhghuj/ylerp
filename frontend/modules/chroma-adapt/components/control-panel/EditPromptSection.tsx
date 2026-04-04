import React from 'react';
import { Loader2, Pencil, Sparkles, Zap, Wand2, Images, Palette } from 'lucide-react';
import { ChromaAppState, ProcessingState, SecondaryWorkflowMode, ColorWorkflowMode } from '../../chromaTypes';
import HelpTooltip from '../HelpTooltip';

interface EditPromptSectionProps {
  state: ChromaAppState;
  t: any;
  onEditPromptChange?: (val: string) => void;
  onEditUserInputChange?: (val: string) => void;
  onAnalyzeSecondary?: () => void;
  onAnalyzeColorAdapt?: () => void;
  onAnalyzeEdit?: () => void;
  onSecondaryBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSecondaryBatchGenerate?: () => void;
  onRemoveSecondaryBatchItem?: (id: string) => void;
  onClearSecondaryBatch?: () => void;
  onSecondaryWorkflowModeChange?: (mode: SecondaryWorkflowMode) => void;
  onColorWorkflowModeChange?: (mode: ColorWorkflowMode) => void;
}

const helpContent: Record<string, { title: string; content: string }> = {
  editPrompt: {
    title: '修改需求',
    content: '描述您希望对图片进行的具体修改。\n\n示例：\n• "把背景换成海滩场景"\n• "给人物戴上一顶红色帽子"\n• "将图片中的文字改为金色"\n• "移除图片右下角的水印"\n\n提示：描述越具体，AI 修改效果越精准。'
  },
  editUserInput: {
    title: '补充参考文字',
    content: '可选的补充说明，帮助 AI 更好地理解您的需求。\n\n可以输入：\n• 图片中需要保留的关键元素\n• 特殊的文字内容（如品牌名、标语等）\n• 希望保持的风格或氛围\n\n此为可选项，不填写也不影响使用。'
  },
  secondaryPrompt: {
    title: '副图生成提示',
    content: '描述您想要生成的副图效果。\n\n示例：\n• "生成一张适合发朋友圈的1:1产品特写，背景更简约"\n• "生成一张白底产品图，适合上架电商平台"\n• "生成一张节日氛围的产品场景图"\n\nAI 会基于参考底图和您的描述来生成新图片。'
  },
  secondaryBatch: {
    title: '批量生成',
    content: '上传多张图片，AI 将根据提示词批量生成新图片。\n\n使用步骤：\n1. 点击上传区域选择多张图片\n2. 确认队列中的图片无误\n3. 点击"批量生成"开始处理\n\n支持 JPG、PNG、WebP 格式，建议单次不超过10张。'
  },
  colorAutoAdapt: {
    title: '自动色彩适配',
    content: 'AI 自动分析两张图片的色彩风格，并将参考图的色调应用到原始海报上。\n\nAI 会智能处理：\n• 提取参考图的主色、辅助色、点缀色\n• 自动映射到原始海报的对应区域\n• 保持原图的布局、字体、纹理不变\n\n点击"分析颜色"即可开始。'
  },
  colorCustomPrompt: {
    title: '自定义色彩提示',
    content: '手动描述您想要的色彩调整效果。\n\n示例：\n• "将主色调改为暖色系，使用橙色和金色"\n• "保持整体色调不变，将蓝色改为紫色"\n• "使用莫兰迪色系，整体偏灰调"\n\nAI 会根据您的描述精确调整色彩。'
  },
  colorAnalyze: {
    title: '分析颜色',
    content: '点击后 AI 将执行两步操作：\n\n第一步：分析原始海报和参考图的色彩方案\n第二步：将参考图的色调智能映射到原始海报\n\n分析完成后可以直接生成效果图。'
  },
  secondaryAnalyze: {
    title: '分析规划',
    content: 'AI 将分析参考底图并生成创作规划。\n\n分析内容包括：\n• 识别图片中的主要元素和构图\n• 根据您的提示词制定生成方案\n• 规划色彩、布局、风格等细节\n\n分析完成后将自动开始生成图片。'
  }
};

const EditPromptSection: React.FC<EditPromptSectionProps> = ({
  state,
  t,
  onEditPromptChange,
  onEditUserInputChange,
  onAnalyzeSecondary,
  onAnalyzeColorAdapt,
  onAnalyzeEdit,
  onSecondaryBatchUpload,
  onSecondaryBatchGenerate,
  onRemoveSecondaryBatchItem,
  onClearSecondaryBatch,
  onSecondaryWorkflowModeChange,
  onColorWorkflowModeChange
}) => {
  const isProcessing = state.status === ProcessingState.GENERATING || state.status === ProcessingState.ANALYZING;

  const StepHeader = ({ step, title, helpKey }: { step: string, title: string, helpKey?: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{step}</span>
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      {helpKey && helpContent[helpKey] && <HelpTooltip {...helpContent[helpKey]} />}
    </div>
  );

  if (state.mode === 'IMAGE_EDIT') {
    return (
      <div className="space-y-3">
        <StepHeader step={t.promptStep} title={t.editInstructions} helpKey="editPrompt" />
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-bold text-slate-600">{t.editInstruction || '修改需求'}</label>
            <HelpTooltip {...helpContent.editPrompt} />
          </div>
          <textarea
            value={state.editPrompt}
            onChange={(e) => onEditPromptChange?.(e.target.value)}
            placeholder={t.editPlaceholder}
            className="w-full h-28 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none transition-all"
            disabled={isProcessing}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-bold text-slate-600">{t.genRequirement || '补充参考文字'}</label>
            <HelpTooltip {...helpContent.editUserInput} />
          </div>
          <textarea
            value={state.editUserInput}
            onChange={(e) => onEditUserInputChange?.(e.target.value)}
            placeholder={t.editUserInputPlaceholder || '可选：输入补充说明，帮助AI更好理解需求...'}
            className="w-full h-20 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none transition-all"
            disabled={isProcessing}
          />
        </div>
      </div>
    );
  }

  if (state.mode === 'SECONDARY_GENERATION') {
    const workflowModes: { id: SecondaryWorkflowMode; label: string; icon: React.ReactNode }[] = [
      { id: 'single_model', label: t.singleMode || 'Single', icon: <Sparkles size={14} /> },
      { id: 'dual_model', label: t.batchMode || 'Batch', icon: <Images size={14} /> },
    ];

    return (
      <div className="space-y-4">
        <StepHeader step={t.promptStep} title={t.secondaryPrompt} helpKey="secondaryPrompt" />

        <div className="flex gap-2">
          {workflowModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onSecondaryWorkflowModeChange?.(mode.id)}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                state.secondaryWorkflowMode === mode.id
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300 hover:text-brand-600'
              } disabled:opacity-40`}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>

        {state.secondaryWorkflowMode === 'single_model' ? (
          <div className="space-y-3">
            <textarea
              value={state.editPrompt}
              onChange={(e) => onEditPromptChange?.(e.target.value)}
              placeholder={t.editPromptPlaceholder}
              className="w-full h-28 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none transition-all"
              disabled={isProcessing}
            />
            <button
              onClick={onAnalyzeSecondary}
              disabled={isProcessing || !state.posterImage || !state.editPrompt}
              className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all duration-200 ${
                (!isProcessing && state.posterImage && state.editPrompt)
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 active:scale-[0.98]'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Zap size={16} />}
              1. {t.analyze || 'Analyze & Plan'}
              <span className="ml-1"><HelpTooltip {...helpContent.secondaryAnalyze} /></span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onSecondaryBatchUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isProcessing}
              />
              <div className="border-2 border-dashed border-slate-200 hover:border-brand-300 rounded-xl p-4 text-center transition-colors bg-white">
                <Images className="mx-auto text-slate-300 mb-2" size={24} />
                <span className="text-xs font-medium text-slate-400">{t.batchUpload || 'Upload multiple images'}</span>
              </div>
            </div>

            {state.secondaryBatchQueue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">{t.batchQueue || 'Queue'} ({state.secondaryBatchQueue.length})</span>
                  {onClearSecondaryBatch && (
                    <button
                      onClick={onClearSecondaryBatch}
                      disabled={isProcessing}
                      className="text-[10px] text-red-400 hover:text-red-500 font-medium transition-colors"
                    >
                      {t.clearAll || 'Clear All'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {state.secondaryBatchQueue.map((item) => (
                    <div key={item.id} className="relative aspect-square bg-white border border-slate-200 rounded-lg overflow-hidden group">
                      <img src={item.original} alt="" className="w-full h-full object-cover" />
                      {onRemoveSecondaryBatchItem && !isProcessing && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveSecondaryBatchItem(item.id); }}
                          className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-[8px] leading-none">×</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onSecondaryBatchGenerate}
              disabled={isProcessing || state.secondaryBatchQueue.length === 0}
              className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all duration-200 ${
                (!isProcessing && state.secondaryBatchQueue.length > 0)
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 active:scale-[0.98]'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Wand2 size={16} />}
              {t.batchGenerate || 'Batch Generate'}
              <span className="ml-1"><HelpTooltip {...helpContent.secondaryBatch} /></span>
            </button>
          </div>
        )}
      </div>
    );
  }

  if (state.mode === 'COLOR_ADAPT') {
    const colorModes: { id: ColorWorkflowMode; label: string; icon: React.ReactNode }[] = [
      { id: 'single_model', label: t.autoAdapt || 'Auto', icon: <Palette size={14} /> },
      { id: 'dual_model', label: t.customPrompt || 'Custom', icon: <Pencil size={14} /> },
    ];

    return (
      <div className="space-y-4">
        <StepHeader step={t.promptStep} title={t.colorPrompt || 'Color Adaptation'} helpKey={state.colorWorkflowMode === 'single_model' ? 'colorAutoAdapt' : 'colorCustomPrompt'} />

        <div className="flex gap-2">
          {colorModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onColorWorkflowModeChange?.(mode.id)}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                state.colorWorkflowMode === mode.id
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300 hover:text-brand-600'
              } disabled:opacity-40`}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>

        {state.colorWorkflowMode === 'dual_model' && (
          <textarea
            value={state.editPrompt}
            onChange={(e) => onEditPromptChange?.(e.target.value)}
            placeholder={t.editPromptPlaceholder}
            className="w-full h-28 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none transition-all"
            disabled={isProcessing}
          />
        )}

        <button
          onClick={onAnalyzeColorAdapt}
          disabled={isProcessing || !state.posterImage || !state.referenceImage}
          className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-all duration-200 ${
            (!isProcessing && state.posterImage && state.referenceImage)
              ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 active:scale-[0.98]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles size={16} />}
          1. {t.analyzeColor || 'Analyze Colors'}
          <span className="ml-1"><HelpTooltip {...helpContent.colorAnalyze} /></span>
        </button>
      </div>
    );
  }

  return null;
};

export default EditPromptSection;
