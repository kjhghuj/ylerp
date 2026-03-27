
import React, { useCallback } from 'react';
import { ChromaAppState, ProcessingState, PipelineItem, PipelineStatus } from '../chromaTypes';
import { generateImageTranslation } from '../services/apiService';

interface UsePipelineLogicProps {
  state: ChromaAppState;
  setState: React.Dispatch<React.SetStateAction<ChromaAppState>>;
}

export const usePipelineLogic = ({ state, setState }: UsePipelineLogicProps) => {

  const handleRemovePipelineItem = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      pipelineQueue: prev.pipelineQueue.filter(item => item.id !== id)
    }));
  }, [setState]);


  const handleBatchTranslateStart = useCallback(async () => {
    setState(prev => {
      if (prev.pipelineQueue.length === 0) return prev;
      return {
        ...prev,
        status: ProcessingState.GENERATING,
        progress: 0,
        progressText: `Starting translation batch (0/${prev.pipelineQueue.length})...`
      };
    });

    try {
      const updateProgress = (queue: PipelineItem[]) => {
        const completed = queue.filter(i => i.status === 'DONE' || i.status === 'ERROR').length;
        const total = queue.length;
        const percent = Math.round((completed / total) * 100);
        return { percent, text: `Translating batch (${completed}/${total})...` };
      };

      const processItem = async (item: PipelineItem) => {
        if (item.status === 'DONE') return;

        setState(prev => ({
          ...prev,
          pipelineQueue: prev.pipelineQueue.map(i => i.id === item.id ? { ...i, status: 'TRANSLATING' as PipelineStatus } : i)
        }));

        try {
          const translationResult = await generateImageTranslation(
            item.original,
            state.translationTarget,
            state.targetFont,
            state.generationModel
          );
          const final = translationResult.url;

          setState(prev => {
            const newQueue = prev.pipelineQueue.map(i => i.id === item.id ? { ...i, final: final, status: 'DONE' as PipelineStatus } : i);
            const prog = updateProgress(newQueue);
            return {
              ...prev,
              pipelineQueue: newQueue,
              progress: prog.percent,
              progressText: prog.text
            };
          });

        } catch (error) {
          console.error(`Error processing item ${item.id}`, error);
          setState(prev => {
            const newQueue = prev.pipelineQueue.map(i => i.id === item.id ? { ...i, status: 'ERROR' as PipelineStatus, error: 'Failed' } : i);
            const prog = updateProgress(newQueue);
            return {
              ...prev,
              pipelineQueue: newQueue,
              progress: prog.percent,
              progressText: prog.text
            };
          });
        }
      };

      const BATCH_SIZE = 4;
      let currentQueue = state.pipelineQueue;

      for (let i = 0; i < currentQueue.length; i += BATCH_SIZE) {
        const batch = currentQueue.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(item => processItem(item)));
        currentQueue = (await new Promise(resolve => {
          setState(prev => {
            resolve(prev.pipelineQueue);
            return prev;
          });
        })) as PipelineItem[];
      }

      setState(prev => ({
        ...prev,
        status: ProcessingState.COMPLETE,
        progress: 100,
        progressText: 'Batch Translation Completed!'
      }));

    } catch (e: any) {
      console.error("Batch translate failed", e);
      setState(prev => ({ ...prev, status: ProcessingState.ERROR, errorMessage: "Batch Translation Failed", progress: 0 }));
    }

  }, [state.translationTarget, state.targetFont, state.generationModel, setState]);

  return {
    handleBatchTranslateStart,
    handleRemovePipelineItem
  };
};
