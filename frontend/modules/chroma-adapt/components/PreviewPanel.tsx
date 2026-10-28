import { Progress } from '../../../components/ui/progress';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/button';

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

const ProgressOverlay = ({ progress, text, isIndeterminate = false }: { progress: number; text: string; isIndeterminate?: boolean }) => (
  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-card/95 p-6 backdrop-blur-sm" role="status" aria-live="polite"><div className="w-full max-w-xs space-y-3"><div className="flex items-center justify-between gap-2 text-foreground"><span className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="animate-spin text-primary" size={16} />{text}</span>{!isIndeterminate && <span className="text-xs tabular-nums text-primary">{progress}%</span>}</div><Progress value={isIndeterminate ? undefined : progress} aria-label={text || '图像处理进度'} aria-valuenow={isIndeterminate ? undefined : progress} className="h-2" /></div></div>
);

const ImagePreviewModal: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => (
  <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="flex max-h-[95vh] w-[calc(100%-2rem)] max-w-5xl items-center justify-center rounded-xl bg-card p-3" closeLabel="关闭图片预览"><DialogTitle className="sr-only">图片预览</DialogTitle><DialogDescription className="sr-only">查看图片细节</DialogDescription><img src={src} alt="图片预览" className="max-h-[85vh] max-w-full rounded-lg object-contain" /></DialogContent></Dialog>
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

      <div className="lg:col-span-7 flex h-full min-h-[28rem] flex-col lg:min-h-0">
        <div className="bg-muted rounded-2xl shadow-2xl p-5 flex-1 flex flex-col relative overflow-hidden ring-1 ring-border/5">

          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[60px] pointer-events-none"></div>

          {(isGenerating || isAnalyzing) && (
            <ProgressOverlay
              progress={isAnalyzing ? 100 : state.progress}
              text={isAnalyzing ? (state.progressText || t.analyzing) : state.progressText}
              isIndeterminate={isAnalyzing}
            />
          )}

          <div className="flex justify-between items-center mb-4 relative z-10 flex-none">
            <h2 className="text-foreground font-medium text-sm flex items-center gap-2">
              {t.previewCanvas}
              {state.status === ProcessingState.COMPLETE && (
                <span className="bg-success/20 text-success text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t.ready}</span>
              )}
            </h2>

            {state.status === ProcessingState.COMPLETE && (
              <Button variant="ghost"
                onClick={onExport}
                disabled={isExporting}
                className={cn("h-auto", "group flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 bg-card/5 hover:bg-card/10 text-foreground hover:text-foreground border border-border/10 hover:border-border/20 disabled:opacity-50")}
              >
                {isExporting ? <Loader2 className="animate-spin w-4 h-4" /> : <Download size={15} className="text-primary group-hover:-translate-y-0.5 transition-transform" />}
                {t.export}
              </Button>
            )}
          </div>

          <div className="flex-1 relative z-10 min-h-0 overflow-hidden">

            {isBatchTranslateMode ? (
              <div className="h-full overflow-y-auto py-1 px-1 custom-scrollbar">
                {state.pipelineQueue.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
                    {state.pipelineQueue.map((item, idx) => (
                      <div key={item.id} className="relative aspect-[3/4] bg-card/5 border border-border/10 rounded-xl overflow-hidden group">
                        <img
                          src={item.final || item.original}
                          alt={`Batch item ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setActivePreviewImage(item.final || item.original)}
                        />
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-muted/60 text-foreground backdrop-blur-md capitalize">
                          {item.status.toLowerCase()}
                        </div>
                        {onRemoveItem && !isGenerating && (
                          <Button aria-label={state.language === "zh" ? "移除图片" : "Remove image"} variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }}
                            className={cn("h-auto", "absolute top-2 right-2 p-1 bg-muted/60 hover:bg-destructive/80 text-destructive-foreground rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all z-20")}
                          >
                            <X size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center h-full flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 bg-card/5 rounded-2xl flex items-center justify-center border border-border/10">
                      <ArrowRight className="text-muted-foreground" size={28} strokeWidth={1.5} />
                    </div>
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-muted-foreground font-medium text-base">{t.waitingInput}</h3>
                      <p className="text-muted-foreground text-sm mt-1.5">Waiting for images to be uploaded in the batch queue.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : isSecondaryBatch ? (
              <div className="h-full overflow-y-auto py-1 px-1 custom-scrollbar">
                {(isGenerating || (state.status === ProcessingState.COMPLETE && state.generationProgress.total > 0)) && (
                  <div className="mb-3 px-1">
                    <div className="flex items-center justify-between text-xs text-foreground mb-1.5">
                      <span>{isGenerating ? (state.language === 'zh' ? '批量生成中...' : 'Batch generating...') : (state.language === 'zh' ? '批量完成' : 'Batch complete')}</span>
                      <span className="font-mono">{state.generationProgress.completed}/{state.generationProgress.total}</span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-500 ease-out"
                        style={{ width: state.generationProgress.total > 0 ? `${(state.generationProgress.completed / state.generationProgress.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-4">
                  {state.secondaryBatchQueue.map((item, idx) => {
                    const displayImage = item.result || item.original;
                    const statusColor = {
                      'PENDING': 'bg-muted text-foreground',
                      'PLANNING': 'bg-warning-subtle text-warning',
                      'PLANNED': 'bg-accent text-accent-foreground',
                      'GENERATING': 'bg-primary text-primary-foreground',
                      'DONE': 'bg-success-subtle text-success',
                      'ERROR': 'bg-destructive/15 text-danger'
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
                      <div key={item.id} className="relative aspect-square bg-card/5 border border-border/10 rounded-xl overflow-hidden group">
                        <img
                          src={displayImage}
                          alt={`Batch item ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setActivePreviewImage(displayImage)}
                        />
                        {(item.status === 'PLANNING' || item.status === 'GENERATING') && (
                          <div className="absolute inset-0 bg-muted/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1">
                            <Loader2 className="animate-spin text-foreground" size={18} />
                            <span className="text-foreground text-[9px] font-medium">{statusLabel}</span>
                          </div>
                        )}
                        <div className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-xs font-bold rounded ${statusColor}`}>
                          {statusLabel}
                        </div>
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-muted/50 text-foreground">
                          #{idx + 1}
                        </div>
                        {onRemoveSecondaryBatchItem && !isGenerating && (
                          <Button aria-label={state.language === "zh" ? "移除图片" : "Remove image"} variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onRemoveSecondaryBatchItem(item.id); }}
                            className={cn("h-auto", "absolute top-1.5 right-1.5 p-1 bg-muted/60 hover:bg-destructive/80 text-destructive-foreground rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all z-20")}
                          >
                            <X size={10} />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isSecondaryGen ? (
              <div className="h-full flex flex-col gap-3 p-1 overflow-y-auto">
                <div className="flex-none w-full h-44 bg-card/5 rounded-xl border border-border/10 overflow-hidden relative">
                  <div className="absolute top-2 left-2 bg-muted/50 text-foreground text-[10px] px-2 py-0.5 rounded-md z-10 font-medium">{t.original}</div>
                  {state.posterImage ? (
                    <img
                      src={state.posterImage}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => setActivePreviewImage(state.posterImage!)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-foreground text-sm">Waiting for upload</div>
                  )}
                </div>

                <div className="flex-1 flex justify-center items-center min-h-[280px]">
                  <div className="relative aspect-square w-full max-w-[420px] bg-card/5 rounded-xl border border-border/10 overflow-hidden">
                    <div className="absolute top-3 left-3 bg-primary/70 backdrop-blur-md text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-md z-10">AI Output (1:1)</div>
                    {state.resultImage ? (
                      <img
                        src={state.resultImage}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setActivePreviewImage(state.resultImage!)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground text-sm p-4 text-center">
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
                        className={`relative aspect-[3/4] bg-card/5 rounded-xl overflow-hidden group transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-ring border-primary/60'
                            : 'border border-border/10 hover:border-border/20'
                        }`}
                        onClick={() => onSelectResult?.(idx)}
                      ><Button variant="ghost" className="absolute inset-0 h-full w-full rounded-none p-0 hover:bg-transparent focus-visible:ring-inset" aria-label="选择生成结果" onClick={event => { event.stopPropagation(); event.currentTarget.parentElement?.click(); }} />
                        <img
                          src={img}
                          alt={`Result ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-muted/60 text-foreground">
                          #{idx + 1}
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-lg">
                            <Check size={12} className="text-foreground" />
                          </div>
                        )}
                        <div className={`absolute bottom-0 inset-x-0 p-1.5 transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'}`}>
                          <div className={`text-center text-[10px] font-bold py-1 rounded-lg backdrop-blur-md ${
                            isSelected
                              ? 'bg-primary/80 text-primary-foreground'
                              : 'bg-muted/50 text-foreground'
                          }`}>
                            {isSelected ? t.selectedResult : t.selectResult}
                          </div>
                        </div>
                        <Button aria-label={state.language === "zh" ? "预览图片" : "Preview image"} variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setActivePreviewImage(img); }}
                          className={cn("h-auto", "absolute top-2 right-2 p-1 bg-muted/60 hover:bg-muted/80 text-foreground rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all z-20")}
                          style={{ display: isSelected ? 'none' : undefined }}
                        >
                          <ImageIcon size={12} />
                        </Button>
                      </div>
                    );
                  })}
                  {isMultiGenerating && Array.from(
                    { length: state.concurrentCount - state.resultImages.length },
                    (_, idx) => (
                      <div
                        key={`placeholder-${idx}`}
                        className="relative aspect-[3/4] bg-card/5 rounded-xl overflow-hidden border border-border/10 border-dashed flex flex-col items-center justify-center gap-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-card/5 flex items-center justify-center">
                          <Loader2 className="animate-spin text-primary" size={16} />
                        </div>
                        <span className="text-foreground text-[10px] font-medium">
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
                        className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl ring-1 ring-border/10 transition-transform duration-500 group-hover:scale-[1.01]"
                      />
                      <div className="absolute top-7 left-7 bg-muted/50 backdrop-blur-md text-foreground text-[10px] font-bold px-2.5 py-1 rounded-lg pointer-events-none">{t.original}</div>
                    </div>
                  )
                ) : (
                  <div className="text-center space-y-4 flex flex-col items-center">
                    <div className="w-16 h-16 bg-card/5 rounded-2xl flex items-center justify-center border border-border/10">
                      <ArrowRight className="text-muted-foreground" size={28} strokeWidth={1.5} />
                    </div>
                    <div className="max-w-xs mx-auto">
                      <h3 className="text-muted-foreground font-medium text-base">{t.waitingInput}</h3>
                      <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">{t.waitingDesc}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {(!isSecondaryGen) && state.resultImage && (
            <div className="mt-3 flex gap-4 justify-center text-[10px] text-muted-foreground flex-none">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div> {state.mode === 'COLOR_ADAPT' ? t.legendTone : t.remixed}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-muted rounded-full"></div> {t.legendLayout}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default PreviewPanel;
