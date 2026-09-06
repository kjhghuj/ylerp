import React, { useRef, useState } from 'react';
import { Upload, Loader2, Lock, Calendar } from 'lucide-react';
import { useProductAnalysisStrings } from '../i18n';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isUploading: boolean;
  /** 无 product-analysis.upload 权限时置 true：锁定交互并提示 */
  disabled?: boolean;
  /** 数据日期（YYYY-MM-DD）与回调：上传前必须选定 */
  date: string;
  onDateChange: (date: string) => void;
}

/** 每日上传区：选数据日期 + 点击/拖拽文件，上传中/无权限时禁用 */
export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileSelected,
  isUploading,
  disabled = false,
  date,
  onDateChange,
}) => {
  const strings = useProductAnalysisStrings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const locked = disabled || isUploading;

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !locked) onFileSelected(file);
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
      className="rounded-2xl border border-dashed p-5 flex flex-wrap items-center gap-4 transition-colors duration-200"
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
        className="hidden"
        disabled={locked}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {isUploading ? (
        <Loader2 size={28} className="animate-spin shrink-0" style={{ color: 'var(--primary)' }} />
      ) : disabled ? (
        <Lock size={28} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      ) : (
        <Upload size={28} className="shrink-0" style={{ color: 'var(--primary)' }} />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {isUploading ? strings.uploading : strings.uploadTitle}
        </p>
        <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
          {disabled ? strings.uploadDisabled : strings.uploadHint}
        </p>
      </div>
      <label
        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm shrink-0"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <Calendar size={14} style={{ color: 'var(--text-tertiary)' }} />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{strings.uploadDate}</span>
        <input
          type="date"
          value={date}
          max="2100-12-31"
          onChange={(event) => onDateChange(event.target.value)}
          disabled={locked}
          className="rounded-lg border px-2 py-1 text-sm"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-light)',
            color: 'var(--text-primary)',
          }}
        />
      </label>
    </div>
  );
};
