
import React from 'react';
import { Loader2, Pencil, Sparkles, Zap, Wand2, Images, Palette } from 'lucide-react';
import { ChromaAppState, ProcessingState, SecondaryWorkflowMode, ColorWorkflowMode } from '../../chromaTypes';

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

  const StepHeader = ({ step, title }: { step: string, title: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-brand-500 text-white text-[10px] font-bold">{step}</span>
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
    </div>
  );

  if (state.mode === 'IMAGE_EDIT') {
    return (
      <div className="space-y-3">
        <StepHeader step={t.promptStep} title={t.editInstructions} />
        <textarea
          value={state.editPrompt}
          onChange={(e) => onEditPromptChange?.(e.target.value)}
          placeholder={t.editPromptPlaceholder}
          className="w-full h-28 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none transition-all"
          disabled={isProcessing}
        />
        <textarea
          value={state.editUserInput}
          onChange={(e) => onEditUserInputChange?.(e.target.value)}
          placeholder={t.editUserInputPlaceholder}
          className="w-full h-20 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none transition-all"
          disabled={isProcessing}
        />
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
        <StepHeader step={t.promptStep} title={t.secondaryPrompt} />

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
        <StepHeader step={t.promptStep} title={t.colorPrompt || 'Color Adaptation'} />

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
        </button>
      </div>
    );
  }

  return null;
};

export default EditPromptSection;
