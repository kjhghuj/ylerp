import React, { useState, useEffect } from 'react';
import { Clock, Trash2, ChevronLeft, ChevronRight, X, BarChart3, Image as ImageIcon } from 'lucide-react';
import { CostSummary, ChromaRecord, ChromaImageInfo } from '../chromaTypes';
import { getChromaImageUrl } from '../services/apiService';

interface GenerationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'zh' | 'en';
  costSummary: CostSummary;
  savedImages: ChromaImageInfo[];
  imagesTotal: number;
  onLoadImages: (page: number) => void;
  onDeleteImage: (id: string) => void;
  records: ChromaRecord[];
  recordsTotal: number;
  onLoadRecords: (page: number) => void;
}

const MODE_LABELS: Record<string, { zh: string; en: string }> = {
  TRANSLATION: { zh: '翻译', en: 'Translation' },
  IMAGE_EDIT: { zh: '编辑', en: 'Edit' },
  SECONDARY_GENERATION: { zh: '方图', en: '1:1' },
  COLOR_ADAPT: { zh: '色彩', en: 'Color' },
};

const formatCost = (cost: number) => `¥${cost.toFixed(3)}`;

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hour}:${min}`;
};

const GenerationHistory: React.FC<GenerationHistoryProps> = ({
  isOpen,
  onClose,
  language,
  costSummary,
  savedImages,
  imagesTotal,
  onLoadImages,
  onDeleteImage,
  records,
  recordsTotal,
  onLoadRecords,
}) => {
  const [activeTab, setActiveTab] = useState<'records' | 'images'>('records');
  const [recordsPage, setRecordsPage] = useState(1);
  const [imagesPage, setImagesPage] = useState(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    if (isOpen) {
      onLoadRecords(1);
      onLoadImages(1);
    }
  }, [isOpen]);

  const handleRecordsPage = (page: number) => {
    setRecordsPage(page);
    onLoadRecords(page);
  };

  const handleImagesPage = (page: number) => {
    setImagesPage(page);
    onLoadImages(page);
  };

  if (!isOpen) return null;

  const recordsTotalPages = Math.ceil(recordsTotal / pageSize);
  const imagesTotalPages = Math.ceil(imagesTotal / pageSize);

  return (
    <>
      {previewImage && (
        <div
          className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full z-50"
          >
            <X size={24} />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="fixed inset-0 z-[100] flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <BarChart3 size={18} className="text-brand-500" />
              {language === 'zh' ? '生成记录' : 'History'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Cost Summary */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{language === 'zh' ? '今日' : 'Today'}</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{formatCost(costSummary.today)}</div>
              </div>
              <div className="text-center border-x border-slate-200">
                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{language === 'zh' ? '本月' : 'Month'}</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{formatCost(costSummary.month)}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{language === 'zh' ? '总计' : 'Total'}</div>
                <div className="text-sm font-bold text-brand-600 mt-0.5">{formatCost(costSummary.total)}</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex px-5 pt-2 gap-1">
            <button
              onClick={() => setActiveTab('records')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'records'
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Clock size={13} />
              {language === 'zh' ? '记录' : 'Records'}
              <span className="text-[10px] opacity-60">({recordsTotal})</span>
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'images'
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ImageIcon size={13} />
              {language === 'zh' ? '图片' : 'Images'}
              <span className="text-[10px] opacity-60">({imagesTotal})</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {activeTab === 'records' ? (
              records.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {language === 'zh' ? '暂无记录' : 'No records yet'}
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => {
                    const modeInfo = MODE_LABELS[record.mode] || { zh: record.mode, en: record.mode };
                    const isSuccess = record.status === 'success';
                    return (
                      <div
                        key={record.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                          isSuccess
                            ? 'bg-white border-slate-100 hover:border-slate-200'
                            : 'bg-red-50/50 border-red-100'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full flex-none ${isSuccess ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-700">
                              {language === 'zh' ? modeInfo.zh : modeInfo.en}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{record.model}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{formatDate(record.createdAt)}</div>
                        </div>
                        <div className={`text-xs font-bold flex-none ${isSuccess ? 'text-slate-600' : 'text-red-400'}`}>
                          {isSuccess ? formatCost(record.cost) : (language === 'zh' ? '失败' : 'Error')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              savedImages.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {language === 'zh' ? '暂无图片' : 'No images yet'}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {savedImages.map((img) => {
                    const imageUrl = getChromaImageUrl(img.id);
                    return (
                      <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                        <img
                          src={imageUrl}
                          alt={img.originalName || 'Generated'}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                          onClick={() => setPreviewImage(imageUrl)}
                        />
                        <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-white/80 truncate">{formatDate(img.createdAt)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteImage(img.id);
                              }}
                              className="p-0.5 bg-red-500/80 hover:bg-red-500 text-white rounded"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Pagination */}
          {((activeTab === 'records' && recordsTotalPages > 1) || (activeTab === 'images' && imagesTotalPages > 1)) && (
            <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => activeTab === 'records'
                  ? handleRecordsPage(recordsPage - 1)
                  : handleImagesPage(imagesPage - 1)
                }
                disabled={activeTab === 'records' ? recordsPage <= 1 : imagesPage <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-slate-500">
                {activeTab === 'records' ? recordsPage : imagesPage} / {activeTab === 'records' ? recordsTotalPages : imagesTotalPages}
              </span>
              <button
                onClick={() => activeTab === 'records'
                  ? handleRecordsPage(recordsPage + 1)
                  : handleImagesPage(imagesPage + 1)
                }
                disabled={activeTab === 'records' ? recordsPage >= recordsTotalPages : imagesPage >= imagesTotalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default GenerationHistory;
