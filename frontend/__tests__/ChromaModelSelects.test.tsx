import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormSelect } from '../components/FormSelect';
import type { AnalysisModel, GenerationModel } from '../modules/chroma-adapt/chromaTypes';

// jsdom lacks pointer capture and layout scrolling used by the real Radix list.
const platformMethods = ['hasPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const;
const descriptors = platformMethods.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
beforeAll(() => {
  platformMethods.forEach(key => {
    if (!HTMLElement.prototype[key]) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: key === 'hasPointerCapture' ? () => false : () => undefined });
  });
});
afterAll(() => {
  platformMethods.forEach((key, index) => {
    if (descriptors[index]) Object.defineProperty(HTMLElement.prototype, key, descriptors[index]!);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  });
});

const analysisModels: Array<{ id: AnalysisModel; label: string }> = [
  { id: 'doubao-seed-2-0-lite', label: 'Seed-2.0-lite' },
  { id: 'doubao-seed-2-0-mini', label: 'Seed-2.0-mini' },
  { id: 'doubao-seed-2-0-pro', label: 'Seed-2.0-pro' },
];
const generationModels: Array<{ id: GenerationModel; label: string }> = [
  { id: 'doubao-seedream-4.5', label: 'Seedream-4.5' },
  { id: 'doubao-seedream-5.0-lite', label: 'Seedream-5.0-lite' },
];

/** Mirrors the ChromaAdapt toolbar: two independently named shared selects. */
function ModelBar({ language, onGenerate }: { language: 'zh' | 'en'; onGenerate: () => void }) {
  const [analysisModel, setAnalysisModel] = useState<AnalysisModel>('doubao-seed-2-0-lite');
  const [generationModel, setGenerationModel] = useState<GenerationModel>('doubao-seedream-4.5');
  return (
    <div>
      <FormSelect
        aria-label={language === 'zh' ? '分析模型' : 'Analysis model'}
        value={analysisModel}
        options={analysisModels.map(model => ({ value: model.id, label: model.label }))}
        onValueChange={value => setAnalysisModel(value as AnalysisModel)}
      />
      <FormSelect
        aria-label={language === 'zh' ? '生图模型' : 'Image model'}
        value={generationModel}
        options={generationModels.map(model => ({ value: model.id, label: model.label }))}
        onValueChange={value => setGenerationModel(value as GenerationModel)}
      />
      <button type="button" data-testid="current-analysis">{analysisModel}</button>
      <button type="button" data-testid="current-generation">{generationModel}</button>
      <button type="button" onClick={onGenerate}>生成</button>
    </div>
  );
}

describe('ChromaAdapt model selects', () => {
  it('changes only the picked model family, never triggering generation', async () => {
    const onGenerate = vi.fn();
    render(<ModelBar language="zh" onGenerate={onGenerate} />);
    expect(screen.getByTestId('current-analysis')).toHaveTextContent('doubao-seed-2-0-lite');
    expect(screen.getByTestId('current-generation')).toHaveTextContent('doubao-seedream-4.5');

    await userEvent.click(screen.getByRole('combobox', { name: '生图模型' }));
    await userEvent.click(screen.getByRole('option', { name: 'Seedream-5.0-lite' }));
    expect(screen.getByTestId('current-generation')).toHaveTextContent('doubao-seedream-5.0-lite');
    // The other family is untouched.
    expect(screen.getByTestId('current-analysis')).toHaveTextContent('doubao-seed-2-0-lite');
    expect(onGenerate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('combobox', { name: '分析模型' }));
    await userEvent.click(screen.getByRole('option', { name: 'Seed-2.0-pro' }));
    expect(screen.getByTestId('current-analysis')).toHaveTextContent('doubao-seed-2-0-pro');
    expect(screen.getByTestId('current-generation')).toHaveTextContent('doubao-seedream-5.0-lite');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('works under both accessible-name locales', async () => {
    const { unmount } = render(<ModelBar language="en" onGenerate={() => {}} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Analysis model' }));
    await userEvent.click(screen.getByRole('option', { name: 'Seed-2.0-mini' }));
    expect(screen.getByTestId('current-analysis')).toHaveTextContent('doubao-seed-2-0-mini');
    unmount();

    render(<ModelBar language="zh" onGenerate={() => {}} />);
    await userEvent.click(screen.getByRole('combobox', { name: '分析模型' }));
    await userEvent.click(screen.getByRole('option', { name: 'Seed-2.0-lite' }));
    expect(screen.getByTestId('current-analysis')).toHaveTextContent('doubao-seed-2-0-lite');
  });
});
