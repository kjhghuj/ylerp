
import React, { useState } from 'react';
import { Download, Loader2, ArrowRight, Sparkles, X, Check, Image as ImageIcon } from 'lucide-react';
import { ChromaAppState, ProcessingState } from '../chromaTypes';
import { getTranslation } from '../utils/translations';
import { getCSSFilterFromPalette, exportImage } from '../utils/imageHelpers';
import ComparisonSlider from './ComparisonSlider';

interface PreviewPanelProps {
  state: ChromaAppState;
  onExport: () => void;
  isExporting: boolean;
  onRemoveItem?: (id: string) => void;
  onSelectResult?: (index: number) => void;
  onRemoveSecondaryBatchItem?: (id: string) => void;
}

const ProgressOverlay = ({ progress, text, isIndeterminate = false }: { progress: number, text: string, isIndeterminate?: boolean }) => (
  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6">
    <div className="w-full max-w-xs space-y-3">
      <div className="flex items-center justify-between text-white mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="text-brand-400 animate-pulse" size={16} />
          <span className="font-semibold tracking-wide text-sm">{text}</span>
        </div>
        {!isIndeterminate && <span className="font-mono text-brand-300 text-xs">{progress}%</span>}
      </div>
      <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
        <div
          className={`bg-brand-500 h-full transition-all duration-500 ease-out ${isIndeterminate ? 'w-full animate-pulse' : ''}`}
          style={{ width: isIndeterminate ? '100%' : `${progress}%` }}
        ></div>
      </div>
    </div>
  </div>
);

const ImagePreviewModal = ({ src, onClose }: { src: string, onClose: () => void }) => (
  <div
    className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
    onClick={onClose}
  >
    <button
      onClick={onClose}
      className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-50"
    >
      <X size={24} />
    </button>
    <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <img
        src={src}
        alt="Full Preview"
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
      />
    </div>
  </div>
);

const PreviewPanel: React.FC<PreviewPanelProps> = ({ state, onExport, isExporting, onRemoveItem, onSelectResult, onRemoveSecondaryBatchItem }) => {
  const t = getTranslation(state.language);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);

  const currentFilterStyle = state.mode === 'COLOR_ADAPT' && state.resultImage && state.resultImage !== state.posterImage
    ? 'none'
    : (state.mode === 'COLOR_ADAPT' ? getCSSFilterFromPalette(state.extractedPalette) : 'none');

  const isBatchTranslateMode = state.mode === 'TRANSLATION' && state.pipelineQueue.length > 0;
  const showContent = state.posterImage || (isBatchTranslateMode && state.pipelineQueue.length > 0);
  const showComparison = state.resultImage && state.posterImage;
  const isSecondaryGen = state.mode === 'SECONDARY_GENERATION';
  const isAnalyzing = state.status === ProcessingState.ANALYZING;
  const isGenerating = state.status === ProcessingState.GENERATING;
  const isMultiResult = state.mode === 'COLOR_ADAPT' && state.resultImages.length > 1;
  const isMultiGenerating = state.mode === 'COLOR_ADAPT' && isGenerating && state.concurrentCount > 1;
  const isSecondaryBatch = isSecondaryGen && state.secondaryBatchQueue.length > 0;

  return (
    <>
      {activePreviewImage && (
        <ImagePreviewModal
          src={activePreviewImage}
          onClose={() => setActivePreviewImage(null)}
        />
      )}

      <div className="lg:col-span-7 h-full flex flex-col min-h-0">
        <div className="bg-slate-900 rounded-2xl shadow-2xl p-5 flex-1 flex flex-col relative overflow-hidden ring-1 ring-white/5">

          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-500/5 rounded-full blur-[80px] pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none"></div>

          {(isGenerating || isAnalyzing) && (
            <ProgressOverlay
              progress={isAnalyzing ? 100 : state.progress}
              text={isAnalyzing ? (state.progressText || t.analyzing) : state.progressText}
              isIndeterminate={isAnalyzing}
            />
          )}

          <div className="flex justify-between items-center mb-4 relative z-10 flex-none">
            <h2 className="text-white/80 font-medium text-sm flex items-center gap-2">
              {t.previewCanvas}
              {state.status === ProcessingState.COMPLETE && (
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t.ready}</span>
              )}
            </h2>

            {state.status === ProcessingState.COMPLETE && (
              <button
                onClick={onExport}
                disabled={isExporting}
                className="group flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 hover:border-white/20 disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="animate-spin w-4 h-4" /> : <Download size={15} className="text-brand-400 group-hover:-translate-y-0.5 transition-transform" />}
                {t.export}
              </button>
            )}
          </div>

          <div className="flex-1 relative z-10 min-h-0 overflow-hidden">

            {isBatchTranslateMode ? (
              <div className="h-full overflow-y-auto py-1 px-1 custom-scrollbar">
                {state.pipelineQueue.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
                    {state.pipelineQueue.map((item, idx) => (
                      <div key={item.id} className="relative aspect-[3/4] bg-white/5 border border-white/10 rounded-xl overflow-hidden group">
                        <img
                          src={item.final || item.original}
                          alt={`Batch item ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setActivePreviewImage(item.final || item.original)}
                        />
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-black/60 text-white/80 backdrop-blur-md capitalize">
                          {item.status.toLowerCase()}
                        </div>
                        {onRemoveItem && !isGenerating && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }}
                            className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center h-full flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                      <ArrowRight className="text-slate-500" size={28} strokeWidth={1.5} />
                    </div>
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-slate-300 font-medium text-base">{t.waitingInput}</h3>
                      <p className="text-slate-500 text-sm mt-1.5">Waiting for images to be uploaded in the batch queue.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : isSecondaryBatch ? (
              <div className="h-full overflow-y-auto py-1 px-1 custom-scrollbar">
                {(isGenerating || (state.status === ProcessingState.COMPLETE && state.generationProgress.total > 0)) && (
                  <div className="mb-3 px-1">
                    <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
                      <span>{isGenerating ? (state.language === 'zh' ? '批量生成中...' : 'Batch generating...') : (state.language === 'zh' ? '批量完成' : 'Batch complete')}</span>
                      <span className="font-mono">{state.generationProgress.completed}/{state.generationProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-brand-500 h-full transition-all duration-500 ease-out"
                        style={{ width: state.generationProgress.total > 0 ? `${(state.generationProgress.completed / state.generationProgress.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
                  {state.secondaryBatchQueue.map((item, idx) => {
                    const displayImage = item.result || item.original;
                    const statusColor = {
                      'PENDING': 'bg-slate-500',
                      'PLANNING': 'bg-yellow-500',
                      'PLANNED': 'bg-blue-500',
                      'GENERATING': 'bg-brand-500',
                      'DONE': 'bg-emerald-500',
                      'ERROR': 'bg-red-500'
                    }[item.status];
                    const statusLabel = {
                      'PENDING': state.language === 'zh' ? '等待中' : 'Pending',
                      'PLANNING': state.language === 'zh' ? '规划中' : 'Planning',
                      'PLANNED': state.language === 'zh' ? '已规划' : 'Planned',
                      'GENERATING': state.language === 'zh' ? '生成中' : 'Generating',
                      'DONE': state.language === 'zh' ? '完成' : 'Done',
                      'ERROR': state.language === 'zh' ? '失败' : 'Error'
                    }[item.status];

                    return (
                      <div key={item.id} className="relative aspect-square bg-white/5 border border-white/10 rounded-xl overflow-hidden group">
                        <img
                          src={displayImage}
                          alt={`Batch item ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setActivePreviewImage(displayImage)}
                        />
                        {(item.status === 'PLANNING' || item.status === 'GENERATING') && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1">
                            <Loader2 className="animate-spin text-white" size={18} />
                            <span className="text-white/70 text-[9px] font-medium">{statusLabel}</span>
                          </div>
                        )}
                        <div className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded ${statusColor} text-white`}>
                          {statusLabel}
                        </div>
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-black/50 text-white/80">
                          #{idx + 1}
                        </div>
                        {onRemoveSecondaryBatchItem && !isGenerating && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveSecondaryBatchItem(item.id); }}
                            className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isSecondaryGen ? (
              <div className="h-full flex flex-col gap-3 p-1 overflow-y-auto">
                <div className="flex-none w-full h-44 bg-white/5 rounded-xl border border-white/10 overflow-hidden relative">
                  <div className="absolute top-2 left-2 bg-black/50 text-white/80 text-[10px] px-2 py-0.5 rounded-md z-10 font-medium">{t.original}</div>
                  {state.posterImage ? (
                    <img
                      src={state.posterImage}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => setActivePreviewImage(state.posterImage!)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">Waiting for upload</div>
                  )}
                </div>

                <div className="flex-1 flex justify-center items-center min-h-[280px]">
                  <div className="relative aspect-square w-full max-w-[420px] bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    <div className="absolute top-3 left-3 bg-brand-500/70 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10">AI Output (1:1)</div>
                    {state.resultImage ? (
                      <img
                        src={state.resultImage}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setActivePreviewImage(state.resultImage!)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-sm p-4 text-center">
                        {(isGenerating || isAnalyzing) ? 'Processing...' : 'Output will appear here (1:1)'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (isMultiResult || isMultiGenerating) ? (
              <div className="h-full overflow-y-auto py-1 px-1 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3 pb-4">
                  {state.resultImages.map((img, idx) => {
                    const isSelected = state.resultImage === img;
                    return (
                      <div
                        key={idx}
                        className={`relative aspect-[3/4] bg-white/5 rounded-xl overflow-hidden group transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-brand-400 border-brand-400/60'
                            : 'border border-white/10 hover:border-white/20'
                        }`}
                        onClick={() => onSelectResult?.(idx)}
                      >
                        <img
                          src={img}
                          alt={`Result ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-black/60 text-white/80">
                          #{idx + 1}
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check size={12} className="text-white" />
                          </div>
                        )}
                        <div className={`absolute bottom-0 inset-x-0 p-1.5 transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <div className={`text-center text-[10px] font-bold py-1 rounded-lg backdrop-blur-md ${
                            isSelected
                              ? 'bg-brand-500/80 text-white'
                              : 'bg-black/50 text-white/70'
                          }`}>
                            {isSelected ? t.selectedResult : t.selectResult}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActivePreviewImage(img); }}
                          className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                          style={{ display: isSelected ? 'none' : undefined }}
                        >
                          <ImageIcon size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {isMultiGenerating && Array.from(
                    { length: state.concurrentCount - state.resultImages.length },
                    (_, idx) => (
                      <div
                        key={`placeholder-${idx}`}
                        className="relative aspect-[3/4] bg-white/5 rounded-xl overflow-hidden border border-white/10 border-dashed flex flex-col items-center justify-center gap-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                          <Loader2 className="animate-spin text-brand-400" size={16} />
                        </div>
                        <span className="text-white/20 text-[10px] font-medium">
                          {state.language === 'zh' ? '生成中...' : 'Generating...'}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                {showContent ? (
                  showComparison ? (
                    <ComparisonSlider
                      beforeImage={state.posterImage!}
                      afterImage={state.resultImage!}
                      filterStyle={currentFilterStyle}
                      lang={state.language}
                    />
                  ) : (
                    <div className="relative max-w-full max-h-full p-4 group">
                      <img
                        src={state.posterImage!}
                        alt="Original"
                        className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-[1.01]"
                      />
                      <div className="absolute top-7 left-7 bg-black/50 backdrop-blur-md text-white/80 text-[10px] font-bold px-2.5 py-1 rounded-lg pointer-events-none">{t.original}</div>
                    </div>
                  )
                ) : (
                  <div className="text-center space-y-4 flex flex-col items-center">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                      <ArrowRight className="text-slate-500" size={28} strokeWidth={1.5} />
                    </div>
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-slate-300 font-medium text-base">{t.waitingInput}</h3>
                      <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">{t.waitingDesc}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {(!isSecondaryGen) && state.resultImage && (
            <div className="mt-3 flex gap-4 justify-center text-[10px] text-slate-500 flex-none">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full"></div> {state.mode === 'COLOR_ADAPT' ? t.legendTone : t.remixed}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full"></div> {t.legendLayout}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default PreviewPanel;
