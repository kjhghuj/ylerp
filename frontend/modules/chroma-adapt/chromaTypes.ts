
export type ChromaLanguage = 'en' | 'zh';
export type Language = ChromaLanguage;

export type AppMode =
  | 'COLOR_ADAPT'
  | 'IMAGE_EDIT'
  | 'TRANSLATION'
  | 'SECONDARY_GENERATION';

export type TranslationTarget = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'ms' | 'tl' | 'th';

export type TargetFont = 'original' | 'sans_serif' | 'serif' | 'handwritten' | 'bold_display';

export type AnalysisModel = 'doubao-seed-2-0-lite' | 'doubao-seed-2-0-mini' | 'doubao-seed-2-0-pro' | 'doubao-vision';
export type GenerationModel = 'doubao-seedream-5.0-lite' | 'doubao-seedream-4.5';

export interface ColorPalette {
  main: string;
  secondary: string;
  accent: string;
  mood?: string;
}

export enum ProcessingState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export type PipelineStatus = 'PENDING' | 'TRANSLATING' | 'DONE' | 'ERROR';
export type SecondaryWorkflowMode = 'single_model' | 'dual_model';
export type ColorWorkflowMode = 'single_model' | 'dual_model';

export type SecondaryBatchStatus = 'PENDING' | 'PLANNING' | 'PLANNED' | 'GENERATING' | 'DONE' | 'ERROR';

export interface SecondaryBatchItem {
  id: string;
  original: string;
  status: SecondaryBatchStatus;
  plan?: string;
  result?: string;
  error?: string;
}

export interface PipelineItem {
  id: string;
  original: string;
  status: PipelineStatus;
  adapted?: string;
  final?: string;
  error?: string;
}

export interface GenerationProgress {
  completed: number;
  total: number;
  errors: number;
}

export interface ChromaAppState {
  mode: AppMode;
  language: ChromaLanguage;
  posterImage: string | null;
  referenceImage: string | null;
  extractedPalette: string[] | null;
  status: ProcessingState;
  errorMessage: string | null;
  resultImage: string | null;
  styleConfig: StyleConfig;
  translationTarget: TranslationTarget;
  targetFont: TargetFont;
  editPrompt: string;
  colorAdaptPrompt: string;
  editUserInput: string;
  progress: number;
  progressText: string;
  pipelineQueue: PipelineItem[];
  analysisModel: AnalysisModel;
  generationModel: GenerationModel;
  concurrentCount: number;
  resultImages: string[];
  generationProgress: GenerationProgress;
  colorWorkflowMode: ColorWorkflowMode;
  secondaryBatchQueue: SecondaryBatchItem[];
  secondaryWorkflowMode: SecondaryWorkflowMode;
}

export interface StyleConfig {
  replaceProduct: boolean;
  keepLayout: boolean;
  keepFonts: boolean;
  keepTexture: boolean;
  keepLighting: boolean;
  recolorTextOnly: boolean;
}
