import React from 'react';
import { Upload, XCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { ChromaV2AppState, ProcessingState } from '../../chromaV2Types';

interface ImageUploadSectionProps {
  state: ChromaV2AppState;
  t: any;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'poster' | 'reference') => void;
  onRemoveImage: (type: 'poster' | 'reference', e: React.MouseEvent) => void;
  showReferenceUpload: boolean;
}

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
    return t.originalPoster;
  };

  const getReferenceLabel = () => {
    if (state.mode === 'IMAGE_EDIT') return t.editRef;
    return t.productRef;
  };

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 sticky top-0 bg-slate-50 py-1 z-10">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px]">{t.assetsStep}</span>
        {t.assets}
      </h2>

      <div className={`grid gap-3 ${showReferenceUpload ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="relative h-32 group">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFileUpload(e, 'poster')}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={state.status === ProcessingState.GENERATING || !!state.posterImage}
          />
          <div className={`h-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-2 transition-all overflow-hidden ${state.posterImage ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 bg-white'}`}>
            {state.posterImage ? (
              <div className="relative w-full h-full">
                <img src={state.posterImage} alt="Poster" className="h-full w-full object-contain" />
                <button
                  onClick={(e) => onRemoveImage('poster', e)}
                  className="absolute top-0 right-0 p-1 text-slate-500 hover:text-red-500 bg-white/80 rounded-bl-lg transition-colors z-20"
                >
                  <XCircle size={18} />
                </button>
              </div>
            ) : (
              <>
                <Upload className="text-slate-400 mb-1" size={20} />
                <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{getPosterLabel()}</span>
              </>
            )}
          </div>
        </div>

        {showReferenceUpload && (
          <div className="relative h-32 group">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onFileUpload(e, 'reference')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={state.status === ProcessingState.GENERATING || !!state.referenceImage}
            />
            <div className={`h-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-2 transition-all overflow-hidden relative ${state.referenceImage ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 bg-white'}`}>
              {state.status === ProcessingState.ANALYZING && state.mode === 'COLOR_ADAPT' && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center flex-col gap-1">
                  <Loader2 className="animate-spin text-brand-600 w-5 h-5" />
                  <span className="text-[10px] font-medium text-brand-600">{t.analyzing}</span>
                </div>
              )}
              {state.referenceImage ? (
                <div className="relative w-full h-full">
                  <img src={state.referenceImage} alt="Ref" className="h-full w-full object-contain" />
                  <button
                    onClick={(e) => onRemoveImage('reference', e)}
                    className="absolute top-0 right-0 p-1 text-slate-500 hover:text-red-500 bg-white/80 rounded-bl-lg transition-colors z-20"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <ImageIcon className="text-slate-400 mb-1" size={20} />
                  <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{getReferenceLabel()}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploadSection;
