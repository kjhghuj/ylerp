import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageUploadSection from '../modules/chroma-adapt/components/control-panel/ImageUploadSection';
import PreviewPanel from '../modules/chroma-adapt/components/PreviewPanel';
import type { ChromaAppState } from '../modules/chroma-adapt/chromaTypes';
import ComparisonSlider from '../modules/chroma-adapt/components/ComparisonSlider';
import HelpTooltip from '../modules/chroma-adapt/components/HelpTooltip';
import GenerationHistory from '../modules/chroma-adapt/components/GenerationHistory';

describe('image tools UI contracts', () => {
  it('uploads and removes each image without opening upload help', async () => {
    const uploaded = vi.fn(), removed = vi.fn();
    function Harness() {
      const [images, setImages] = useState({ posterImage: null as string | null, referenceImage: null as string | null });
      return <ImageUploadSection state={{ mode: 'COLOR_ADAPT', language: 'zh', status: 'IDLE', ...images } as ChromaAppState}
        t={{ assetsStep: '1', assets: '素材', originalPoster: '原图', productRef: '参考图' }} showReferenceUpload
        onFileUpload={(event, type) => { uploaded(type, event.target.files?.[0]); setImages(current => ({ ...current, [type === 'poster' ? 'posterImage' : 'referenceImage']: type + '.png' })); }}
        onRemoveImage={(type) => { removed(type); setImages(current => ({ ...current, [type === 'poster' ? 'posterImage' : 'referenceImage']: null })); }} />;
    }
    render(<Harness />);
    const file = new File(['fixture'], 'fixture.png', { type: 'image/png' });
    for (const [label, type, removeName] of [['原图', 'poster', '移除原图'], ['参考图', 'reference', '移除参考图']]) {
      await userEvent.upload(screen.getByLabelText(label), file);
      expect(uploaded).toHaveBeenLastCalledWith(type, file);
      await userEvent.click(screen.getByRole('button', { name: removeName }));
      expect(removed).toHaveBeenLastCalledWith(type);
      expect(screen.queryByRole('button', { name: removeName })).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  });
  it('opens an unselected result as a preview without selecting or removing it', async () => {
    const select = vi.fn(), remove = vi.fn();
    const state = { mode: 'COLOR_ADAPT', language: 'zh', status: 'COMPLETE', resultImage: 'chosen.png', resultImages: ['chosen.png', 'other.png'], pipelineQueue: [], secondaryBatchQueue: [], concurrentCount: 2, posterImage: null } as unknown as ChromaAppState;
    render(<PreviewPanel state={state} onExport={vi.fn()} isExporting={false} onSelectResult={select} onRemoveItem={remove} />);
    const preview = screen.getByRole('button', { name: '预览图片' });
    await userEvent.click(preview);
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeVisible();
    expect(screen.getByRole('img', { name: '图片预览' })).toHaveAttribute('src', 'other.png');
    expect(select).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(preview).toHaveFocus());
  });
  it('makes image comparison operable with arrows, Home and End', async () => {
    render(<ComparisonSlider beforeImage="before.png" afterImage="after.png" filterStyle="none" lang="zh" />);
    const slider = screen.getByRole('slider', { name: '图像对比' });
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '60');
    await userEvent.keyboard('{Home}');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    await userEvent.keyboard('{ArrowLeft}{End}{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '100');
  });

  it('preserves coordinate-based clipping for touch and clamps at the image edges', () => {
    render(<ComparisonSlider beforeImage="before.png" afterImage="after.png" filterStyle="none" lang="en" />);
    const slider = screen.getByRole('slider', { name: 'Image comparison' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200, right: 300, top: 0, bottom: 100, height: 100, x: 100, y: 0, toJSON() {} });
    fireEvent.touchStart(slider, { touches: [{ clientX: 150 }] });
    expect(slider).toHaveAttribute('aria-valuenow', '25');
    fireEvent.touchMove(slider, { touches: [{ clientX: 500 }] });
    expect(slider).toHaveAttribute('aria-valuenow', '100');
    fireEvent.touchMove(slider, { touches: [{ clientX: 0 }] });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('opens help with the keyboard without invoking the surrounding generate action', async () => {
    const generate = vi.fn();
    render(<button onClick={generate}>Generate <HelpTooltip title="图片帮助" content="上传后再生成" /></button>);
    const help = screen.getByRole('button', { name: '图片帮助' });
    help.focus();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('dialog', { name: '图片帮助' })).toBeVisible();
    expect(generate).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(help).toHaveFocus());
  });

  it('closes only the upper history image preview, then returns focus to its opener', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>历史</button><GenerationHistory isOpen={open} onClose={() => setOpen(false)} language="zh" costSummary={{ today: 0, month: 0, total: 0 } as never} savedImages={[{ id: 'image-1', originalName: '测试图片', createdAt: '2026-10-26T00:00:00Z' } as never]} imagesTotal={1} onLoadImages={vi.fn()} onDeleteImage={vi.fn()} records={[]} recordsTotal={0} onLoadRecords={vi.fn()} /></>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '历史' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('tab', { name: /图片/ }));
    const image = screen.getByRole('button', { name: '预览 测试图片' });
    await userEvent.click(image);
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: /AI 调用记录/ })).toBeVisible();
    await waitFor(() => expect(image).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

