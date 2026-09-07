import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadZone } from '../modules/product-analysis/components/UploadZone';

vi.mock('../StoreContext', () => ({
  useStore: () => ({ language: 'zh' }),
}));

function makeFile(name: string): File {
  return new File(['stub'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function renderZone(overrides: Partial<React.ComponentProps<typeof UploadZone>> = {}) {
  const onFilesSelected = vi.fn();
  render(<UploadZone onFilesSelected={onFilesSelected} isUploading={false} {...overrides} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  return { onFilesSelected, input };
}

describe('UploadZone', () => {
  it('passes all selected files as an array and allows multi-select', () => {
    const { onFilesSelected, input } = renderZone();
    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: [makeFile('a.20260905.xlsx'), makeFile('b.20260906.xlsx')] } });
    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    const files = onFilesSelected.mock.calls[0][0] as File[];
    expect(files).toHaveLength(2);
    expect(files.map((file) => file.name)).toEqual(['a.20260905.xlsx', 'b.20260906.xlsx']);
  });

  it('does not fire when locked by isUploading', () => {
    const { onFilesSelected, input } = renderZone({ isUploading: true });
    expect((input as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { files: [makeFile('a.20260905.xlsx')] } });
    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it('shows the progress label instead of the generic text while uploading', () => {
    render(<UploadZone onFilesSelected={vi.fn()} isUploading uploadingLabel="上传中 2/5…" />);
    expect(screen.getByText('上传中 2/5…')).toBeTruthy();
    expect(screen.queryByText('解析并保存中…')).toBeNull();
  });
});
