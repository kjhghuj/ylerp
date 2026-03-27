import React, { useState } from 'react';
import { Download, Loader2, ArrowRight, Sparkles, X, Check, Image as ImageIcon } from 'lucide-react';
import { ChromaV2AppState, ProcessingState } from '../chromaV2Types';
import { getTranslation } from '../utils/translations';
import { getCSSFilterFromPalette, exportImage } from '../utils/imageHelpers';
import { ComparisonSlider } from './ComparisonSlider';

interface PreviewPanelProps {
  state: ChromaV2AppState;
  onExport: () => void;
  isExporting: boolean;
  onRemoveItem?: (id: string) => void;
  onSelectResult?: (index: number) => void;
  onRemoveSecondaryBatchItem?: (id: string) => void;
}

const ProgressOverlay = ({ progress, text, isIndeterminate = false }: { progress: number, text: string, isIndeterminate?: boolean }) => (
  <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6">
    <div className="w-full max-w-xs space-y-4">
      <div className="flex items-center justify-between text-white mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="text-brand-400 animate-pulse" size={18} />
          <span className="font-semibold tracking-wide text-sm">{text}</span>
        </div>
        {!isIndeterminate && <span className="font-mono text-brand-300 text-xs">{progress}%</span>}
      </div>
      <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden border border-white/10">
        <div
          className={`bg-gradient-to-r from-brand-500 to-indigo-500 h-full transition-all duration-500 ease-out relative ${isIndeterminate ? 'w-full origin-left animate-pulse' : ''}`}
          style={{ width: isIndeterminate ? '100%' : `${progress}%` }}
        />
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
      <img src={src} alt="Full Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
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
        <ImagePreviewModal src={activePreviewImage} onClose={() => setActivePreviewImage(null)} />
      )}

      <div className="lg:col-span-7 h-full flex flex-col min-h-0">
        <div className="bg-slate-950/80 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 flex-1 flex flex-col relative overflow-hidden ring-1 ring-white/10">

          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />

          {(isGenerating || isAnalyzing) && (
            <ProgressOverlay
              progress={isAnalyzing ? 100 : state.progress}
              text={isAnalyzing ? (state.progressText || t.analyzing) : state.progressText}
              isIndeterminate={isAnalyzing}
            />
          )}

          <div className="flex justify-between items-center mb-6 relative z-10 flex-none">
            <h2 className="text-white font-medium text-lg flex items-center gap-3 tracking-wide">
              {t.previewCanvas}
              {state.status === ProcessingState.COMPLETE && (
                <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">{t.ready}</span>
              )}
            </h2>

            {state.status === ProcessingState.COMPLETE && (
              <button
                onClick={onExport}
                disabled={isExporting}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 shadow-lg disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="animate-spin w-4 h-4" /> : <Download size={16} className="text-brand-400" />}
                {t.export}
              </button>
            )}
          </div>

          <div className="flex-1 relative z-10 min-h-0 overflow-hidden">
            {isBatchTranslateMode ? (
              <div className="h-full overflow-y-auto py-2 px-2">
                {state.pipelineQueue.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {state.pipelineQueue.map((item, idx) => (
                      <div key={item.id} className="relative aspect-[3/4] bg-white/5 border border-white/10 rounded-xl overflow-hidden group shadow-lg">
                        <img
                          src={item.final || item.original}
                          alt={`Batch item ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setActivePreviewImage(item.final || item.original)}
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-1 text-[10px] font-bold rounded-md bg-black/70 text-white backdrop-blur-md border border-white/10 shadow-lg capitalize">
                          {item.status.toLowerCase()}
                        </div>
                        {onRemoveItem && !isGenerating && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }}
                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center h-full flex flex-col items-center justify-center space-y-5">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                      <ArrowRight className="text-slate-400" size={32} strokeWidth={1.5} />
                    </div>
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-slate-200 font-medium text-lg tracking-wide">{t.waitingInput}</h3>
                      <p className="text-slate-400 text-sm mt-2 leading-relaxed">Waiting for images to be uploaded in the batch queue.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : isSecondaryBatch ? (
              <div className="h-full overflow-y-auto py-2 px-2">
                {(isGenerating || (state.status === ProcessingState.COMPLETE && state.generationProgress.total > 0)) && (
                  <div className="mb-4 px-1">
                    <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                      <span>{isGenerating ? (state.language === 'zh' ? '批量生成中...' : 'Batch generating...') : (state.language === 'zh' ? '批量完成' : 'Batch complete')}</span>
                      <span className="font-mono">{state.generationProgress.completed}/{state.generationProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-brand-500 to-indigo-500 h-full transition-all duration-500 ease-out"
                        style={{ width: state.generationProgress.total > 0 ? `${(state.generationProgress.completed / state.generationProgress.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                  {state.secondaryBatchQueue.map((item, idx) => {
                    const displayImage = item.result || item.original;
                    const statusColor = {
                      'PENDING': 'bg-slate-500',
                      'PLANNING': 'bg-yellow-500',
                      'PLANNED': 'bg-blue-500',
                      'GENERATING': 'bg-brand-500',
                      'DONE': 'bg-green-500',
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
                      <div key={item.id} className="relative aspect-square bg-white/5 border border-white/10 rounded-xl overflow-hidden group shadow-lg">
                        <img
                          src={displayImage}
                          alt={`Batch item ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setActivePreviewImage(displayImage)}
                        />
                        {(item.status === 'PLANNING' || item.status === 'GENERATING') && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1">
                            <Loader2 className="animate-spin text-white" size={20} />
                            <span className="text-white/80 text-[9px] font-medium">{statusLabel}</span>
                          </div>
                        )}
                        <div className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-md ${statusColor} text-white backdrop-blur-md border border-white/10 shadow-lg`}>
                          {statusLabel}
                        </div>
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-black/60 text-white backdrop-blur-md">
                          #{idx + 1}
                        </div>
                        {onRemoveSecondaryBatchItem && !isGenerating && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveSecondaryBatchItem(item.id); }}
                            className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-lg"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isSecondaryGen ? (
              <div className="h-full flex flex-col gap-4 p-2 overflow-y-auto">
                <div className="flex-none w-full h-48 bg-white/5 rounded-xl border border-white/10 overflow-hidden relative">
                  <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded z-10">{t.original}</div>
                  {state.posterImage ? (
                    <img
                      src={state.posterImage}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => setActivePreviewImage(state.posterImage!)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">Waiting for upload</div>
                  )}
                </div>
                <div className="flex-1 flex justify-center items-center min-h-[300px]">
                  <div className="relative aspect-square w-full max-w-[450px] bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                    <div className="absolute top-4 left-4 bg-brand-600/80 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 rounded-full z-10 shadow-lg">AI Output (1:1)</div>
                    {state.resultImage ? (
                      <img
                        src={state.resultImage}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setActivePreviewImage(state.resultImage!)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30 text-sm p-4 text-center">
                        {(isGenerating || isAnalyzing) ? 'Processing...' : 'Output will appear here (1:1)'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (isMultiResult || isMultiGenerating) ? (
              <div className="h-full overflow-y-auto py-2 px-2">
                <div className={`grid gap-4 pb-4 ${state.concurrentCount <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                  {state.resultImages.map((img, idx) => {
                    const isSelected = state.resultImage === img;
                    return (
                      <div
                        key={idx}
                        className={`relative aspect-[3/4] bg-white/5 rounded-xl overflow-hidden group shadow-lg transition-all duration-300 cursor-pointer ${isSelected
                          ? 'ring-2 ring-brand-400 border-2 border-brand-400/60 scale-[1.02]'
                          : 'border border-white/10 hover:border-white/30'
                          }`}
                        onClick={() => onSelectResult?.(idx)}
                      >
                        <img src={img} alt={`Result ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute top-2 left-2 px-2 py-1 text-[10px] font-bold rounded-md bg-black/70 text-white backdrop-blur-md border border-white/10 shadow-lg">
                          #{idx + 1}
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check size={14} className="text-white" />
                          </div>
                        )}
                        <div className={`absolute bottom-0 inset-x-0 p-2 transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <div className={`text-center text-xs font-medium py-1.5 rounded-lg backdrop-blur-md border ${isSelected
                            ? 'bg-brand-500/80 text-white border-brand-400/50'
                            : 'bg-black/60 text-white/80 border-white/10'
                            }`}>
                            {isSelected ? t.selectedResult : t.selectResult}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActivePreviewImage(img); }}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-lg"
                          style={{ display: isSelected ? 'none' : undefined }}
                        >
                          <ImageIcon size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {isMultiGenerating && Array.from(
                    { length: state.concurrentCount - state.resultImages.length },
                    (_, idx) => (
                      <div key={`placeholder-${idx}`} className="relative aspect-[3/4] bg-white/5 rounded-xl overflow-hidden border border-white/10 border-dashed flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                          <Loader2 className="animate-spin text-brand-400" size={20} />
                        </div>
                        <span className="text-white/30 text-xs font-medium">
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
                      leftImage={state.posterImage!}
                      rightImage={state.resultImage!}
                      leftLabel={t.original}
                      rightLabel={t.remixed}
                    />
                  ) : (
                    <div className="relative max-w-full max-h-full p-4 group">
                      <img
                        src={state.posterImage!}
                        alt="Original"
                        className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-[1.01]"
                      />
                      <div className="absolute top-8 left-8 bg-black/60 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 rounded-full pointer-events-none border border-white/10 shadow-lg">{t.original}</div>
                    </div>
                  )
                ) : (
                  <div className="text-center space-y-5 flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                      <div className="absolute inset-0 bg-gradient-to-tr from-brand-500/20 to-transparent rounded-2xl" />
                      <ArrowRight className="text-slate-400 relative z-10" size={32} strokeWidth={1.5} />
                    </div>
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-slate-200 font-medium text-lg tracking-wide">{t.waitingInput}</h3>
                      <p className="text-slate-400 text-sm mt-2 leading-relaxed">{t.waitingDesc}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!isSecondaryGen && state.resultImage && (
            <div className="mt-2 flex gap-4 justify-center text-xs text-slate-500 flex-none">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-brand-600 rounded-full" />
                {state.mode === 'COLOR_ADAPT' ? t.legendTone : t.remixed}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-slate-400 rounded-full" />
                {t.legendLayout}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PreviewPanel;
