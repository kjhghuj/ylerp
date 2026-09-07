import React, { useRef, useState } from 'react';
import { Upload, Loader2, Lock } from 'lucide-react';
import { useProductAnalysisStrings } from '../i18n';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading: boolean;
  /** 无 product-analysis.upload 权限时置 true：锁定交互并提示 */
  disabled?: boolean;
  /** 批量上传进度文案（如「上传中 2/5…」），缺省显示通用上传中文案 */
  uploadingLabel?: string;
}

/** 每日上传区（紧凑条）：点击/拖拽选择 .xlsx（支持多选），日期从文件名识别 */
export const UploadZone: React.FC<UploadZoneProps> = ({
  onFilesSelected,
  isUploading,
  disabled = false,
  uploadingLabel,
}) => {
  const strings = useProductAnalysisStrings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const locked = disabled || isUploading;

  const handleFiles = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length > 0 && !locked) onFilesSelected(list);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !locked && inputRef.current?.click()}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !locked) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!locked) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className="rounded-2xl border border-dashed p-3 flex items-center gap-3 transition-colors duration-200"
      style={{
        backgroundColor: isDragging ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        borderColor: isDragging ? 'var(--primary)' : 'var(--border-light)',
        opacity: locked ? 0.7 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        disabled={locked}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {isUploading ? (
        <Loader2 size={20} className="animate-spin shrink-0" style={{ color: 'var(--primary)' }} />
      ) : disabled ? (
        <Lock size={20} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      ) : (
        <Upload size={20} className="shrink-0" style={{ color: 'var(--primary)' }} />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>
          {isUploading ? (uploadingLabel ?? strings.uploading) : strings.uploadTitle}
        </p>
        <p className="text-[11px] mt-0.5 leading-snug break-all" style={{ color: 'var(--text-tertiary)' }}>
          {disabled ? strings.uploadDisabled : strings.uploadHint}
        </p>
      </div>
    </div>
  );
};
