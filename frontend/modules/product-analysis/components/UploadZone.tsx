import React, { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { useProductAnalysisStrings } from '../i18n';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isUploading: boolean;
}

/** 上传区：点击选择 + 拖拽，上传中禁用 */
export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelected, isUploading }) => {
  const strings = useProductAnalysisStrings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !isUploading) onFileSelected(file);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isUploading && inputRef.current?.click()}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !isUploading) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isUploading) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className="rounded-2xl border border-dashed p-5 flex items-center gap-4 cursor-pointer transition-colors duration-200"
      style={{
        backgroundColor: isDragging ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        borderColor: isDragging ? 'var(--primary)' : 'var(--border-light)',
        opacity: isUploading ? 0.7 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        disabled={isUploading}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {isUploading ? (
        <Loader2 size={28} className="animate-spin shrink-0" style={{ color: 'var(--primary)' }} />
      ) : (
        <Upload size={28} className="shrink-0" style={{ color: 'var(--primary)' }} />
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {isUploading ? strings.uploading : strings.uploadTitle}
        </p>
        <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
          {strings.uploadHint}
        </p>
      </div>
    </div>
  );
};
