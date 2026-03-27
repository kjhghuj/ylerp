
import React, { useCallback } from 'react';
import { ChromaV2AppState, ProcessingState, PipelineItem } from '../chromaV2Types';

interface UseFileHandlersProps {
  state: ChromaV2AppState;
  setState: React.Dispatch<React.SetStateAction<ChromaV2AppState>>;
  performAnalysis: (imageData: string) => Promise<any>;
}

export const useFileHandlers = ({ state, setState, performAnalysis }: UseFileHandlersProps) => {

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'poster' | 'reference') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (typeof event.target?.result === 'string') {
        const imageData = event.target.result;
        
        setState(prev => {
          const isPoster = type === 'poster';
          let nextStatus = prev.status;
          
          if (isPoster) {
             nextStatus = ProcessingState.READY;
             return {
               ...prev,
               posterImage: imageData,
               resultImage: null, 
               editPrompt: '',
               status: nextStatus
             };
          } else {
             return {
               ...prev,
               referenceImage: imageData,
               status: prev.posterImage ? ProcessingState.READY : ProcessingState.IDLE
             };
          }
        });

        if (type === 'reference' && state.mode === 'COLOR_ADAPT') {
          await performAnalysis(imageData);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [state.mode, performAnalysis, setState]);

  const handlePipelineRefUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setState(prev => ({
          ...prev,
          pipelineReference: event.target?.result as string
        }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [setState]);

  const handlePipelineBatchUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files) as File[];
    
    fileArray.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          const newItem: PipelineItem = {
            id: Math.random().toString(36).substr(2, 9),
            original: event.target.result as string,
            status: 'PENDING'
          };
          
          setState(prev => ({
            ...prev,
            pipelineQueue: [...prev.pipelineQueue, newItem]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [setState]);

  return {
    handleFileUpload,
    handlePipelineRefUpload,
    handlePipelineBatchUpload
  };
};
