
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChromaV2AppState, ProcessingState, StyleConfig, AppMode, TranslationTarget, TargetFont, GenerationProgress, SecondaryBatchItem, SecondaryWorkflowMode, ColorWorkflowMode } from '../chromaV2Types';
import { analyzeImageColors, generateImageTranslation, generateImageEdit, generateSecondaryImage, analyzeAndCreateSecondaryPrompt, SECONDARY_SINGLE_MODEL_PROMPT, analyzeAndCreateEditPrompt, COLOR_ADAPT_SINGLE_MODEL_PROMPT, analyzeAndCreateColorAdaptPrompt, generateColorAdaptation } from '../services/apiService';
import { getCSSFilterFromPalette, exportImage } from '../utils/imageHelpers';
import { getTranslation } from '../utils/translations';
import { useFileHandlers } from './useFileHandlers';
import { usePipelineLogic } from './usePipelineLogic';

const INITIAL_GENERATION_PROGRESS: GenerationProgress = { completed: 0, total: 0, errors: 0 };

const INITIAL_STYLE_CONFIG: StyleConfig = {
  replaceProduct: true,
  keepLayout: true,
  keepFonts: true,
  keepTexture: true,
  keepLighting: true,
  recolorTextOnly: false,
};

export const useChromaV2App = () => {
  const [state, setState] = useState<ChromaV2AppState>({
    mode: 'TRANSLATION',
    language: 'zh',
    posterImage: null,
    referenceImage: null,
    extractedPalette: null,
    status: ProcessingState.IDLE,
    errorMessage: null,
    resultImage: null,
    styleConfig: INITIAL_STYLE_CONFIG,
    translationTarget: 'en',
    targetFont: 'original',
    editPrompt: '',
    colorAdaptPrompt: COLOR_ADAPT_SINGLE_MODEL_PROMPT,
    editUserInput: '',
    progress: 0,
    progressText: '',
    pipelineQueue: [],
    analysisModel: 'doubao-seed-2-0-lite',
    generationModel: 'doubao-seedream-5.0-lite',
    concurrentCount: 1,
    resultImages: [],
    generationProgress: { ...INITIAL_GENERATION_PROGRESS },
    colorWorkflowMode: 'single_model',
    secondaryBatchQueue: [],
    secondaryWorkflowMode: 'single_model'
  });

  const [isExporting, setIsExporting] = useState(false);
  const progressInterval = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (progressInterval.current) window.clearInterval(progressInterval.current);
    };
  }, []);

  const performAnalysis = useCallback(async (imageData: string) => {
    setState(prev => ({ ...prev, status: ProcessingState.ANALYZING }));
    try {
      const palette = await analyzeImageColors(imageData, state.language, state.analysisModel);
      setState(prev => ({
        ...prev,
        extractedPalette: palette,
        status: prev.posterImage ? ProcessingState.READY : ProcessingState.IDLE
      }));
      return palette;
    } catch (error) {
      console.error("Analysis failed", error);
      setState(prev => ({
        ...prev,
        status: ProcessingState.ERROR,
        errorMessage: '色彩分析失败'
      }));
      return null;
    }
  }, [state.language, state.analysisModel]);

  const {
    handleFileUpload,
    handlePipelineRefUpload,
    handlePipelineBatchUpload
  } = useFileHandlers({
    state,
    setState,
    performAnalysis
  });

  const {
    handleBatchTranslateStart,
    handleRemovePipelineItem
  } = usePipelineLogic({ state, setState });

  const setMode = useCallback((newMode: AppMode) => {
    setState(prev => ({
      ...prev,
      mode: newMode,
      status: prev.status === ProcessingState.GENERATING ? ProcessingState.GENERATING : (prev.posterImage ? ProcessingState.READY : ProcessingState.IDLE),
      errorMessage: null,
      resultImage: null,
      editPrompt: newMode === 'SECONDARY_GENERATION' ? SECONDARY_SINGLE_MODEL_PROMPT : '',
      colorAdaptPrompt: newMode === 'COLOR_ADAPT' ? (prev.colorAdaptPrompt || COLOR_ADAPT_SINGLE_MODEL_PROMPT) : prev.colorAdaptPrompt,
      editUserInput: ''
    }));
  }, []);

  const handleRemoveImage = useCallback((type: 'poster' | 'reference', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setState(prev => ({
      ...prev,
      [type === 'poster' ? 'posterImage' : 'referenceImage']: null,
      extractedPalette: type === 'reference' ? null : prev.extractedPalette,
      resultImage: type === 'poster' ? null : prev.resultImage,
      resultImages: type === 'poster' ? [] : prev.resultImages,
      status: ProcessingState.IDLE,
      progress: 0,
      editPrompt: '',
      colorAdaptPrompt: type === 'poster' ? COLOR_ADAPT_SINGLE_MODEL_PROMPT : prev.colorAdaptPrompt,
      generationProgress: { ...INITIAL_GENERATION_PROGRESS }
    }));
  }, []);

  const resetApp = useCallback(() => {
    setState(prev => ({
      ...prev,
      posterImage: null,
      referenceImage: null,
      extractedPalette: null,
      status: ProcessingState.IDLE,
      errorMessage: null,
      resultImage: null,
      resultImages: [],
      secondaryBatchQueue: [],
      styleConfig: INITIAL_STYLE_CONFIG,
      editPrompt: '',
      colorAdaptPrompt: COLOR_ADAPT_SINGLE_MODEL_PROMPT,
      editUserInput: '',
      progress: 0,
      progressText: '',
      pipelineQueue: [],
      analysisModel: 'doubao-seed-2-0-lite',
      generationModel: 'doubao-seedream-5.0-lite',
      generationProgress: { ...INITIAL_GENERATION_PROGRESS },
      colorWorkflowMode: 'single_model',
      secondaryWorkflowMode: 'single_model'
    }));
    if (progressInterval.current) clearInterval(progressInterval.current);
  }, []);

  const toggleLanguage = useCallback(() => {
    setState(prev => ({
      ...prev,
      language: prev.language === 'en' ? 'zh' : 'en'
    }));
  }, []);

  const setTranslationTarget = useCallback((target: TranslationTarget) => {
    setState(prev => ({ ...prev, translationTarget: target, editPrompt: '' }));
  }, []);

  const setTargetFont = useCallback((font: TargetFont) => {
    setState(prev => ({ ...prev, targetFont: font, editPrompt: '' }));
  }, []);

  const setEditPrompt = useCallback((val: string) => {
    setState(prev => prev.mode === 'COLOR_ADAPT'
      ? { ...prev, colorAdaptPrompt: val }
      : { ...prev, editPrompt: val }
    );
  }, []);

  const setEditUserInput = useCallback((val: string) => {
    setState(prev => ({ ...prev, editUserInput: val }));
  }, []);

  const setSecondaryWorkflowMode = useCallback((mode: SecondaryWorkflowMode) => {
    setState(prev => ({
      ...prev,
      secondaryWorkflowMode: mode,
      editPrompt: mode === 'single_model' ? (prev.editPrompt || SECONDARY_SINGLE_MODEL_PROMPT) : ''
    }));
  }, []);

  const setColorWorkflowMode = useCallback((mode: ColorWorkflowMode) => {
    setState(prev => ({
      ...prev,
      colorWorkflowMode: mode,
      colorAdaptPrompt: mode === 'single_model' ? (prev.colorAdaptPrompt || COLOR_ADAPT_SINGLE_MODEL_PROMPT) : ''
    }));
  }, []);

  const setAnalysisModel = useCallback((modelKey: any) => {
    setState(prev => ({ ...prev, analysisModel: modelKey }));
  }, []);

  const setGenerationModel = useCallback((modelKey: any) => {
    setState(prev => ({ ...prev, generationModel: modelKey }));
  }, []);

  const setConcurrentCount = useCallback((count: number) => {
    const clamped = Math.max(1, Math.min(4, count));
    setState(prev => ({ ...prev, concurrentCount: clamped }));
  }, []);

  const handleSelectResult = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.resultImages.length) return prev;
      return { ...prev, resultImage: prev.resultImages[index] };
    });
  }, []);

  const handleStyleChange = useCallback((key: keyof StyleConfig) => {
    setState(prev => ({
      ...prev,
      styleConfig: {
        ...prev.styleConfig,
        [key]: !prev.styleConfig[key]
      }
    }));
  }, []);

  const handleAnalyzeColorAdapt = useCallback(async () => {
    if (!state.posterImage || !state.referenceImage || state.colorWorkflowMode !== 'dual_model') return;
    setState(prev => ({ ...prev, status: ProcessingState.ANALYZING, progressText: 'AI Analyzing Color Strategy...' }));
    try {
      const prompt = await analyzeAndCreateColorAdaptPrompt(
        state.posterImage,
        state.referenceImage,
        state.styleConfig,
        state.analysisModel
      );
      setState(prev => ({
        ...prev,
        status: ProcessingState.READY,
        colorAdaptPrompt: prompt
      }));
    } catch (e: any) {
      console.error("Color Adapt Analysis Failed", e);
      setState(prev => ({ ...prev, status: ProcessingState.ERROR, errorMessage: "Failed to analyze color adaptation." }));
    }
  }, [state.posterImage, state.referenceImage, state.styleConfig, state.analysisModel, state.colorWorkflowMode]);

  const handleAnalyzeSecondary = useCallback(async () => {
    if (!state.posterImage || state.secondaryWorkflowMode !== 'dual_model') return;

    setState(prev => ({ ...prev, status: ProcessingState.ANALYZING, progressText: 'AI Analyzing Image...' }));

    try {
      const prompt = await analyzeAndCreateSecondaryPrompt(state.posterImage, state.analysisModel);
      setState(prev => ({
        ...prev,
        status: ProcessingState.READY,
        editPrompt: prompt
      }));
    } catch (e: any) {
      console.error("Secondary Prompt Analysis Failed", e);
      setState(prev => ({ ...prev, status: ProcessingState.ERROR, errorMessage: "Failed to analyze image." }));
    }
  }, [state.posterImage, state.analysisModel, state.secondaryWorkflowMode]);

  const handleAnalyzeEdit = useCallback(async () => {
    if (!state.posterImage || !state.editUserInput) return;

    setState(prev => ({ ...prev, status: ProcessingState.ANALYZING, progressText: 'AI Deep Analyzing...' }));

    try {
      const professionalPrompt = await analyzeAndCreateEditPrompt(
        state.posterImage,
        state.editUserInput,
        state.analysisModel
      );
      setState(prev => ({
        ...prev,
        status: ProcessingState.READY,
        editPrompt: professionalPrompt
      }));
    } catch (e: any) {
      console.error("Edit Analysis Failed", e);
      setState(prev => ({ ...prev, status: ProcessingState.ERROR, errorMessage: "Failed to analyze edit request." }));
    }
  }, [state.posterImage, state.editUserInput, state.analysisModel]);

  const startSimulatedProgress = () => {
    setState(prev => ({ ...prev, progress: 5, progressText: 'Initialization...' }));
    if (progressInterval.current) clearInterval(progressInterval.current);

    progressInterval.current = window.setInterval(() => {
      setState(prev => {
        if (prev.status !== ProcessingState.GENERATING) return prev;
        const increment = prev.progress < 50 ? 5 : (prev.progress < 80 ? 2 : 0.5);
        const newProgress = Math.min(prev.progress + increment, 90);

        let text = 'Processing...';
        if (state.mode === 'SECONDARY_GENERATION') {
          if (newProgress < 50) text = 'Adapting to 1:1 composition...';
          else text = 'Preserving details and style...';
        } else if (state.mode === 'TRANSLATION') {
          if (newProgress < 50) text = 'Translating content...';
          else text = 'Reconstructing layout...';
        } else {
          if (newProgress < 30) text = 'Analyzing composition...';
          else if (newProgress < 60) text = 'Applying neural adaptation...';
          else if (newProgress < 85) text = 'Refining details...';
          else text = 'Finalizing output...';
        }

        return { ...prev, progress: newProgress, progressText: text };
      });
    }, 500);
  };

  const handleSecondaryBatchUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files) as File[];
    fileArray.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          const newItem: SecondaryBatchItem = {
            id: Math.random().toString(36).substr(2, 9),
            original: event.target.result as string,
            status: 'PENDING'
          };
          setState(prev => ({
            ...prev,
            secondaryBatchQueue: [...prev.secondaryBatchQueue, newItem]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [setState]);

  const handleRemoveSecondaryBatchItem = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      secondaryBatchQueue: prev.secondaryBatchQueue.filter(item => item.id !== id)
    }));
  }, [setState]);

  const handleClearSecondaryBatch = useCallback(() => {
    setState(prev => ({
      ...prev,
      secondaryBatchQueue: [],
      generationProgress: { ...INITIAL_GENERATION_PROGRESS }
    }));
  }, [setState]);

  const handleSecondaryBatchGenerate = useCallback(async () => {
    const queue = state.secondaryBatchQueue;
    if (queue.length === 0) return;

    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) await (window as any).aistudio.openSelectKey();
      } catch (e) { console.error(e); }
    }

    const total = queue.length;
    setState(prev => ({
      ...prev,
      status: ProcessingState.GENERATING,
      errorMessage: null,
      generationProgress: { completed: 0, total, errors: 0 }
    }));

    const updateItem = (id: string, updates: Partial<SecondaryBatchItem>) => {
      setState(prev => ({
        ...prev,
        secondaryBatchQueue: prev.secondaryBatchQueue.map(item =>
          item.id === id ? { ...item, ...updates } : item
        )
      }));
    };

    const promises = queue.map(async (item) => {
      try {
        updateItem(item.id, { status: 'PLANNING' });
        const prompt = state.secondaryWorkflowMode === 'dual_model'
          ? await analyzeAndCreateSecondaryPrompt(item.original, state.analysisModel)
          : SECONDARY_SINGLE_MODEL_PROMPT;
        updateItem(item.id, { status: 'PLANNED', plan: prompt });

        updateItem(item.id, { status: 'GENERATING' });
        const result = await generateSecondaryImage(item.original, prompt, state.generationModel);
        updateItem(item.id, { status: 'DONE', result });

        setState(prev => ({
          ...prev,
          generationProgress: {
            ...prev.generationProgress,
            completed: prev.generationProgress.completed + 1
          }
        }));
        return result;
      } catch (error: any) {
        console.error(`Batch item ${item.id} failed:`, error);
        updateItem(item.id, { status: 'ERROR', error: error.message || 'Generation failed' });
        setState(prev => ({
          ...prev,
          generationProgress: {
            ...prev.generationProgress,
            completed: prev.generationProgress.completed + 1,
            errors: prev.generationProgress.errors + 1
          }
        }));
        throw error;
      }
    });

    const results = await Promise.allSettled(promises);
    const errorCount = results.filter(r => r.status === 'rejected').length;
    const successCount = results.filter(r => r.status === 'fulfilled').length;

    setState(prev => ({
      ...prev,
      status: ProcessingState.COMPLETE,
      generationProgress: { completed: total, total, errors: errorCount },
      errorMessage: errorCount > 0
        ? (prev.language === 'zh' ? `${errorCount} 张生成失败` : `${errorCount} generation(s) failed`)
        : null
    }));
  }, [state.secondaryBatchQueue, state.analysisModel, state.generationModel, state.secondaryWorkflowMode]);

  const handleGenerate = useCallback(async () => {
    if (!state.posterImage) return;
    if (state.mode === 'COLOR_ADAPT') {
      if (!state.referenceImage) return;
    }
    if (state.mode === 'IMAGE_EDIT' && !state.editPrompt) return;

    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) await (window as any).aistudio.openSelectKey();
      } catch (e) { console.error(e); }
    }

    const isConcurrent = state.mode === 'COLOR_ADAPT' && state.concurrentCount > 1;

    setState(prev => ({
      ...prev,
      status: ProcessingState.GENERATING,
      errorMessage: null,
      resultImages: [],
      resultImage: null,
      generationProgress: isConcurrent
        ? { completed: 0, total: state.concurrentCount, errors: 0 }
        : { ...INITIAL_GENERATION_PROGRESS }
    }));
    startSimulatedProgress();

    try {
      let colorPrompt = '';
      if (state.mode === 'COLOR_ADAPT') {
        colorPrompt = state.colorWorkflowMode === 'single_model'
          ? (state.colorAdaptPrompt || COLOR_ADAPT_SINGLE_MODEL_PROMPT)
          : (state.colorAdaptPrompt || await analyzeAndCreateColorAdaptPrompt(
            state.posterImage!,
            state.referenceImage!,
            state.styleConfig,
            state.analysisModel
          ));
      }

      if (isConcurrent) {
        const count = state.concurrentCount;
        const promises = Array.from({ length: count }, (_, i) =>
          generateColorAdaptation(
            state.posterImage!,
            state.referenceImage!,
            state.extractedPalette as string[] | null,
            state.styleConfig,
            colorPrompt,
            state.generationModel
          ).then((result) => {
            setState(prev => {
              const newImages = [...prev.resultImages, result];
              const newProgress = {
                completed: prev.generationProgress.completed + 1,
                total: count,
                errors: prev.generationProgress.errors
              };
              const progressPercent = Math.round((newProgress.completed / count) * 90) + 5;
              return {
                ...prev,
                resultImages: newImages,
                resultImage: prev.resultImage || result,
                generationProgress: newProgress,
                progress: progressPercent,
                progressText: `${prev.language === 'zh' ? '正在生成' : 'Generating'} ${newProgress.completed}/${count}...`
              };
            });
            return result;
          })
        );

        const results = await Promise.allSettled(promises);
        const errorCount = results.filter(r => r.status === 'rejected').length;
        const successCount = results.filter(r => r.status === 'fulfilled').length;

        if (progressInterval.current) clearInterval(progressInterval.current);

        if (successCount === 0) {
          const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
          throw new Error(firstError?.reason?.message || 'All generations failed');
        }

        setState(prev => ({
          ...prev,
          status: ProcessingState.COMPLETE,
          progress: 100,
          progressText: prev.language === 'zh' ? '全部完成！' : 'All Complete!',
          generationProgress: { completed: successCount, total: count, errors: errorCount },
          errorMessage: errorCount > 0
            ? (prev.language === 'zh' ? `${errorCount} 张生成失败` : `${errorCount} generation(s) failed`)
            : null
        }));

      } else {
        let generatedImage = '';

        if (state.mode === 'COLOR_ADAPT') {
          generatedImage = await generateColorAdaptation(
            state.posterImage!,
            state.referenceImage!,
            state.extractedPalette as string[] | null,
            state.styleConfig,
            colorPrompt,
            state.generationModel
          );
          setState(prev => ({ ...prev, colorAdaptPrompt: colorPrompt }));
        } else if (state.mode === 'IMAGE_EDIT') {
          generatedImage = await generateImageEdit(
            state.posterImage!,
            state.editPrompt,
            state.generationModel
          );
        } else if (state.mode === 'SECONDARY_GENERATION') {
          const secondaryPrompt = state.secondaryWorkflowMode === 'single_model'
            ? (state.editPrompt || SECONDARY_SINGLE_MODEL_PROMPT)
            : (state.editPrompt || await analyzeAndCreateSecondaryPrompt(state.posterImage!, state.analysisModel));

          generatedImage = await generateSecondaryImage(
            state.posterImage!,
            secondaryPrompt,
            state.generationModel
          );
          setState(prev => ({ ...prev, editPrompt: secondaryPrompt }));
        } else {
          const translationResult = await generateImageTranslation(
            state.posterImage!,
            state.translationTarget,
            state.targetFont,
            state.generationModel
          );
          generatedImage = translationResult.url;
          if (translationResult.instructions) {
            const instr = translationResult.instructions;
            let instructionsText = "【翻译指令详情】\n\n";
            if (instr.translations && instr.translations.length > 0) {
              instructionsText += "文字映射：\n";
              instr.translations.forEach((t: any) => {
                instructionsText += `- "${t.original}" → "${t.translated}"\n`;
              });
              instructionsText += `\n视觉背景：${instr.visual_context || '未提供'}\n`;
            } else if (instr.error) {
              instructionsText += `状态：${instr.error}\n`;
            }
            setState(prev => ({ ...prev, editPrompt: instructionsText }));
          }
        }

        setState(prev => ({
          ...prev,
          status: ProcessingState.COMPLETE,
          resultImage: generatedImage,
          resultImages: [generatedImage],
          progress: 100,
          progressText: prev.language === 'zh' ? '完成！' : 'Completed!'
        }));

        if (progressInterval.current) clearInterval(progressInterval.current);
      }

    } catch (e: any) {
      console.error("Generation failed", e);
      if (progressInterval.current) clearInterval(progressInterval.current);

      let errorMsg = e.message || "Generation failed";
      if (errorMsg.includes("Requested entity was not found") || errorMsg.includes("403")) {
        if ((window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
        }
        errorMsg = "API Key Error. Please re-select key.";
      }
      setState(prev => ({ ...prev, status: ProcessingState.ERROR, errorMessage: errorMsg, progress: 0 }));
    }
  }, [state.mode, state.posterImage, state.referenceImage, state.extractedPalette, state.styleConfig, state.language, state.translationTarget, state.targetFont, state.editPrompt, state.analysisModel, state.generationModel, state.concurrentCount, state.secondaryWorkflowMode, state.colorWorkflowMode, state.colorAdaptPrompt]);

  const handleExport = useCallback(async () => {
    const isBatchTranslateMode = state.mode === 'TRANSLATION' && state.pipelineQueue.length > 0;
    const isSecondaryBatchMode = state.mode === 'SECONDARY_GENERATION' && state.secondaryBatchQueue.length > 0;

    if (isBatchTranslateMode) {
      if (state.pipelineQueue.length === 0) return;
      setIsExporting(true);
      try {
        for (let i = 0; i < state.pipelineQueue.length; i++) {
          const item = state.pipelineQueue[i];
          const imageToExport = item.final || item.original;
          await exportImage(imageToExport, 'none', `chroma-v2-batch-${i + 1}-${Date.now()}.png`);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error("Batch export failed", error);
        setState(prev => ({ ...prev, errorMessage: "Batch export failed" }));
      } finally {
        setIsExporting(false);
      }
      return;
    }

    if (isSecondaryBatchMode) {
      const doneItems = state.secondaryBatchQueue.filter(item => item.status === 'DONE' && item.result);
      if (doneItems.length === 0) return;
      setIsExporting(true);
      try {
        for (let i = 0; i < doneItems.length; i++) {
          await exportImage(doneItems[i].result!, 'none', `chroma-v2-secondary-${i + 1}-${Date.now()}.png`);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error("Secondary batch export failed", error);
        setState(prev => ({ ...prev, errorMessage: "Batch export failed" }));
      } finally {
        setIsExporting(false);
      }
      return;
    }

    if (!state.resultImage) return;
    setIsExporting(true);
    try {
      const filter = state.resultImage === state.posterImage && state.mode === 'COLOR_ADAPT'
        ? getCSSFilterFromPalette(state.extractedPalette)
        : 'none';
      await exportImage(state.resultImage, filter, `chroma-v2-${state.mode.toLowerCase()}-${Date.now()}.png`);
    } catch (error) {
      console.error("Export failed", error);
      setState(prev => ({ ...prev, errorMessage: "Export failed" }));
    } finally {
      setIsExporting(false);
    }
  }, [state.resultImage, state.posterImage, state.mode, state.extractedPalette, state.pipelineQueue, state.secondaryBatchQueue]);

  return {
    state,
    isExporting,
    setMode,
    handleFileUpload,
    handlePipelineBatchUpload,
    handleRemoveImage,
    handleRemovePipelineItem,
    handleGenerate,
    handleAnalyzeSecondary,
    handleBatchTranslateStart,
    handleExport,
    handleStyleChange,
    resetApp,
    toggleLanguage,
    setTranslationTarget,
    setTargetFont,
    onEditPromptChange: setEditPrompt,
    onEditUserInputChange: setEditUserInput,
    setSecondaryWorkflowMode,
    setColorWorkflowMode,
    handleAnalyzeColorAdapt,
    handleAnalyzeEdit,
    setAnalysisModel,
    setGenerationModel,
    setConcurrentCount,
    handleSelectResult,
    handleSecondaryBatchUpload,
    handleRemoveSecondaryBatchItem,
    handleClearSecondaryBatch,
    handleSecondaryBatchGenerate
  };
};
