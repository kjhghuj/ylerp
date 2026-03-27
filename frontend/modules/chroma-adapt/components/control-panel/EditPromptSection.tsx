
import React from 'react';
import { Edit3, Loader2, Sparkles, Upload, Trash2, Images } from 'lucide-react';
import { ChromaAppState, ProcessingState, SecondaryWorkflowMode, ColorWorkflowMode } from '../../chromaTypes';

interface EditPromptSectionProps {
  state: ChromaAppState;
  t: any;
  onEditPromptChange?: (val: string) => void;
  onEditUserInputChange?: (val: string) => void;
  onAnalyzeSecondary?: () => void;
  onAnalyzeEdit?: () => void;
  onSecondaryBatchUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSecondaryBatchGenerate?: () => void;
  onRemoveSecondaryBatchItem?: (id: string) => void;
  onClearSecondaryBatch?: () => void;
  onSecondaryWorkflowModeChange?: (mode: SecondaryWorkflowMode) => void;
  onAnalyzeColorAdapt?: () => void;
  onColorWorkflowModeChange?: (mode: ColorWorkflowMode) => void;
}

const EditPromptSection: React.FC<EditPromptSectionProps> = ({
  state,
  t,
  onEditPromptChange,
  onEditUserInputChange,
  onAnalyzeSecondary,
  onAnalyzeEdit,
  onSecondaryBatchUpload,
  onSecondaryBatchGenerate,
  onRemoveSecondaryBatchItem,
  onClearSecondaryBatch,
  onSecondaryWorkflowModeChange,
  onAnalyzeColorAdapt,
  onColorWorkflowModeChange
}) => {
  const showSecondaryUI = state.mode === 'SECONDARY_GENERATION';
  const showColorAdaptUI = state.mode === 'COLOR_ADAPT';
  const showEditPrompt = state.mode === 'IMAGE_EDIT';

  if (!showSecondaryUI && !showEditPrompt && !showColorAdaptUI) return null;

  const isZh = state.language === 'zh';
  const hasBatchQueue = state.secondaryBatchQueue.length > 0;
  const isProcessing = state.status === ProcessingState.GENERATING || state.status === ProcessingState.ANALYZING;
  const isDualModel = state.secondaryWorkflowMode === 'dual_model';
  const isDualColorModel = state.colorWorkflowMode === 'dual_model';

  return (
    <div className="space-y-4">
      {/* SECONDARY GENERATION SPECIFIC UI */}
      {showColorAdaptUI && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles size={13} /> {isZh ? '色彩适配工作流' : 'Color Adapt Workflow'}
          </h2>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onColorWorkflowModeChange?.('single_model')}
              disabled={isProcessing}
              className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${state.colorWorkflowMode === 'single_model'
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
            >
              {isZh ? '单模型模式' : 'Single Model'}
            </button>
            <button
              type="button"
              onClick={() => onColorWorkflowModeChange?.('dual_model')}
              disabled={isProcessing}
              className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${state.colorWorkflowMode === 'dual_model'
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
            >
              {isZh ? '双模型模式' : 'Dual Model'}
            </button>
          </div>

          {isDualColorModel && (
            <button
              type="button"
              onClick={onAnalyzeColorAdapt}
              disabled={!state.posterImage || !state.referenceImage || isProcessing}
              className={`w-full py-2.5 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 font-medium transition-all ${state.posterImage && state.referenceImage
                  ? 'border-brand-400 bg-brand-50 text-brand-700 hover:bg-brand-100'
                  : 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
                }`}
            >
              {state.status === ProcessingState.ANALYZING ? (
                <>
                  <Loader2 className="animate-spin w-4 h-4" /> {t.analyzing || "Analyzing..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> {isZh ? "1. 分析主图与参考图并生成提示词" : "Analyze Images and Create Prompt"}
                </>
              )}
            </button>
          )}

          {(state.colorAdaptPrompt || state.colorWorkflowMode === 'single_model' || state.status === ProcessingState.ANALYZING) && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Edit3 size={12} /> {isZh ? "色彩适配提示词 (可编辑)" : "Color Adapt Prompt (Editable)"}
              </h2>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 relative overflow-hidden">
                {state.status === ProcessingState.ANALYZING && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-[1px] text-brand-600">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <span className="text-xs font-medium animate-pulse">{isZh ? "正在生成色彩迁移提示词..." : "Generating color adaptation prompt..."}</span>
                  </div>
                )}
                <textarea
                  value={state.colorAdaptPrompt}
                  onChange={(e) => onEditPromptChange && onEditPromptChange(e.target.value)}
                  placeholder={isZh ? "单模型：直接使用通用提示词；双模型：先点击上方分析生成定制提示词" : "Single mode uses universal prompt; dual mode analyzes first"}
                  className="w-full p-2 text-sm text-slate-700 placeholder:text-slate-400 border-0 focus:ring-0 min-h-[120px] resize-none bg-transparent"
                  disabled={isProcessing}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showSecondaryUI && (
        <>
          {/* ── Batch Upload Section ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Images size={13} /> {t.batchUpload}
              </h2>
              {hasBatchQueue && !isProcessing && (
                <button
                  onClick={onClearSecondaryBatch}
                  className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={10} /> {t.clearBatch}
                </button>
              )}
            </div>

            {/* Batch Upload Button */}
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onSecondaryBatchUpload?.(e)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isProcessing}
              />
              <div className={`w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-sm font-medium transition-all ${isProcessing
                  ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50'
                  : 'border-brand-300 text-brand-600 hover:border-brand-400 hover:bg-brand-50/50 bg-white cursor-pointer'
                }`}>
                <Upload size={16} />
                {isZh ? '选择多张图片上传' : 'Select multiple images'}
              </div>
            </div>

            {/* Batch Queue Preview */}
            {hasBatchQueue && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">
                    {state.secondaryBatchQueue.length} {t.batchCount}
                  </span>
                  {state.generationProgress.total > 0 && (
                    <span className="text-xs font-mono text-brand-600">
                      {state.generationProgress.completed}/{state.generationProgress.total}
                      {state.generationProgress.errors > 0 && (
                        <span className="text-red-500 ml-1">({state.generationProgress.errors} {t.batchError})</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Thumbnail Grid */}
                <div className="grid grid-cols-4 gap-1.5">
                  {state.secondaryBatchQueue.map((item) => (
                    <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                      <img
                        src={item.result || item.original}
                        alt=""
                        className={`w-full h-full object-cover ${item.result ? 'ring-2 ring-green-400 ring-inset' : ''}`}
                      />
                      {/* Status overlays */}
                      {(item.status === 'PLANNING' || item.status === 'GENERATING') && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="animate-spin text-white" size={14} />
                        </div>
                      )}
                      {item.status === 'DONE' && (
                        <div className="absolute bottom-0 inset-x-0 bg-green-500/80 text-white text-[8px] text-center py-0.5 font-bold">
                          ✓
                        </div>
                      )}
                      {item.status === 'ERROR' && (
                        <div className="absolute bottom-0 inset-x-0 bg-red-500/80 text-white text-[8px] text-center py-0.5 font-bold">
                          ✗
                        </div>
                      )}
                      {/* Remove button */}
                      {!isProcessing && (
                        <button
                          onClick={() => onRemoveSecondaryBatchItem?.(item.id)}
                          className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                        >
                          <Trash2 size={8} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divider between batch and single */}
          {hasBatchQueue && (
            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-slate-200"></div>
              <span className="px-3 text-[10px] text-slate-400 uppercase">{isZh ? '或单张生成' : 'or single mode'}</span>
              <div className="flex-1 border-t border-slate-200"></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSecondaryWorkflowModeChange?.('single_model')}
              disabled={isProcessing}
              className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${state.secondaryWorkflowMode === 'single_model'
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
            >
              {isZh ? '单模型模式' : 'Single Model'}
            </button>
            <button
              type="button"
              onClick={() => onSecondaryWorkflowModeChange?.('dual_model')}
              disabled={isProcessing}
              className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${state.secondaryWorkflowMode === 'dual_model'
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
            >
              {isZh ? '双模型模式' : 'Dual Model'}
            </button>
          </div>

          {isDualModel && (
            <button
              type="button"
              onClick={onAnalyzeSecondary}
              disabled={!state.posterImage || state.status === ProcessingState.ANALYZING || state.status === ProcessingState.GENERATING}
              className={`w-full py-2.5 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 font-medium transition-all ${state.posterImage
                  ? 'border-brand-400 bg-brand-50 text-brand-700 hover:bg-brand-100'
                  : 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
                }`}
            >
              {state.status === ProcessingState.ANALYZING ? (
                <>
                  <Loader2 className="animate-spin w-4 h-4" /> {t.analyzing || "Analyzing..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> 1. {isZh ? "分析图片并生成提示词" : "Analyze and Create Prompt"}
                </>
              )}
            </button>
          )}

          {(state.editPrompt || state.status === ProcessingState.ANALYZING || state.secondaryWorkflowMode === 'single_model') && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Edit3 size={12} /> {isZh ? "1:1 生成提示词 (可编辑)" : "1:1 Prompt (Editable)"}
              </h2>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 relative overflow-hidden">
                {state.status === ProcessingState.ANALYZING && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-[1px] text-brand-600">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <span className="text-xs font-medium animate-pulse">{isZh ? "正在生成专业提示词..." : "Generating professional prompt..."}</span>
                  </div>
                )}
                <textarea
                  value={state.editPrompt}
                  onChange={(e) => onEditPromptChange && onEditPromptChange(e.target.value)}
                  placeholder={isZh ? "单模型模式：可直接使用通用提示词；双模型模式：点击上方按钮先生成提示词" : "Single mode: use universal prompt directly; Dual mode: analyze first"}
                  className="w-full p-2 text-sm text-slate-700 placeholder:text-slate-400 border-0 focus:ring-0 min-h-[120px] resize-none bg-transparent"
                  disabled={state.status === ProcessingState.GENERATING || state.status === ProcessingState.ANALYZING}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* NORMAL EDIT PROMPT UI */}
      {showEditPrompt && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 sticky top-0 bg-slate-50 py-1 z-10">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px]">2</span>
            {isZh ? "编辑指令" : "Edit Details"}
          </h2>

          <div className="space-y-4">
            {/* Stage 1: User Simple Input & Analysis */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
                {isZh ? "第1步：描述修改需求" : "Step 1: Simple Description"}
              </label>
              <div className="relative mb-3">
                <Edit3 className="absolute top-3 left-3 text-slate-400" size={16} />
                <textarea
                  value={state.editUserInput}
                  onChange={(e) => onEditUserInputChange?.(e.target.value)}
                  placeholder={isZh ? "简单的描述，例如：把沙发颜色改成深蓝色，背景换成海边日落" : "Simple description, e.g., Make the sofa navy blue, change background to a beach sunset"}
                  className="w-full pl-9 pr-3 py-3 text-sm text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[80px] resize-none"
                  disabled={isProcessing}
                />
              </div>
              <button
                type="button"
                onClick={onAnalyzeEdit}
                disabled={!state.posterImage || !state.editUserInput || isProcessing}
                className={`w-full py-2.5 rounded-lg border flex items-center justify-center gap-2 font-medium transition-all ${state.posterImage && state.editUserInput
                    ? 'border-brand-400 bg-brand-50 text-brand-700 hover:bg-brand-100'
                    : 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
                  }`}
              >
                {state.status === ProcessingState.ANALYZING ? (
                  <>
                    <Loader2 className="animate-spin w-4 h-4" /> {isZh ? "AI 深度解析中..." : "AI Deep Analyzing..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> {isZh ? "AI 深度解析指令" : "AI Deep Analysis"}
                  </>
                )}
              </button>
            </div>

            {/* Stage 2: AI Generated Detailed Prompt */}
            {(state.editPrompt || state.status === ProcessingState.ANALYZING) && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-white rounded-xl shadow-sm border border-brand-200 border-l-4 border-l-brand-400 p-4 relative overflow-hidden">
                  <label className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Sparkles size={12} />
                    {isZh ? "第2步：AI 专业修改方案 (可审查调整)" : "Step 2: AI Professional Plan (Reviewable)"}
                  </label>
                  
                  {state.status === ProcessingState.ANALYZING && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-[1px] text-brand-600">
                      <Loader2 className="animate-spin mb-2" size={24} />
                      <span className="text-xs font-medium animate-pulse">
                        {isZh ? "正在生成专业级修改蓝图..." : "Generating professional edit blueprint..."}
                      </span>
                    </div>
                  )}

                  <textarea
                    value={state.editPrompt}
                    onChange={(e) => onEditPromptChange?.(e.target.value)}
                    placeholder={isZh ? "AI 解析后的专业指令将显示在这里..." : "Professional prompt will appear here after analysis..."}
                    className="w-full mt-1 p-3 text-sm text-slate-700 bg-slate-50 placeholder:text-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:bg-white min-h-[140px] resize-none"
                    disabled={isProcessing}
                  />
                  <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                    {isZh ? "点击下方按钮开始按此方案修改" : "Click generate below to execute this plan"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EditPromptSection;
