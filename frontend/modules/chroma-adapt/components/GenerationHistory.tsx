import React, { useState, useEffect } from 'react';
import { Clock, Trash2, ChevronLeft, ChevronRight, BarChart3, Image as ImageIcon } from 'lucide-react';
import { CostSummary, ChromaRecord, ChromaImageInfo } from '../chromaTypes';
import { getChromaImageUrl } from '../services/apiService';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';

interface GenerationHistoryProps {
  isOpen: boolean; onClose: () => void; language: 'zh' | 'en'; costSummary: CostSummary;
  savedImages: ChromaImageInfo[]; imagesTotal: number; onLoadImages: (page: number) => void; onDeleteImage: (id: string) => void;
  records: ChromaRecord[]; recordsTotal: number; onLoadRecords: (page: number, source?: 'native' | 'legacy') => void;
}
const MODE_LABELS: Record<string, { zh: string; en: string }> = { TRANSLATION: { zh: '翻译', en: 'Translation' }, IMAGE_EDIT: { zh: '编辑', en: 'Edit' }, SECONDARY_GENERATION: { zh: '方图', en: '1:1' }, COLOR_ADAPT: { zh: '色彩', en: 'Color' } };
const formatCost = (cost: number | null) => cost == null ? '未计价' : `¥${cost.toFixed(3)}`;
const formatDate = (value: string) => {
  const d = new Date(new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const GenerationHistory: React.FC<GenerationHistoryProps> = ({ isOpen, onClose, language, costSummary, savedImages, imagesTotal, onLoadImages, onDeleteImage, records, recordsTotal, onLoadRecords }) => {
  const zh = language === 'zh';
  const [historySource, setHistorySource] = useState<'native' | 'legacy'>('native');
  const [activeTab, setActiveTab] = useState<'records' | 'images'>('records');
  const [recordsPage, setRecordsPage] = useState(1);
  const [imagesPage, setImagesPage] = useState(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const pageSize = 20;
  useEffect(() => {
    if (isOpen) { setHistorySource('native'); setRecordsPage(1); setImagesPage(1); onLoadRecords(1); onLoadImages(1); }
  }, [isOpen]);
  const handlePage = (page: number) => {
    if (activeTab === 'records') { setRecordsPage(page); onLoadRecords(page, historySource); }
    else { setImagesPage(page); onLoadImages(page); }
  };
  const pages = Math.ceil((activeTab === 'records' ? recordsTotal : imagesTotal) / pageSize);
  const page = activeTab === 'records' ? recordsPage : imagesPage;
  return <Sheet open={isOpen} onOpenChange={next => { if (!next) { setPreviewImage(null); onClose(); } }}>
    <SheetContent className="flex w-full flex-col gap-0 bg-card p-0 text-card-foreground sm:max-w-lg" closeLabel={zh ? '关闭历史记录' : 'Close history'}>
      <SheetHeader className="border-b border-border px-5 py-5 pr-12 text-left"><SheetTitle className="flex items-center gap-2 text-base"><BarChart3 size={18} className="text-primary" />{zh ? 'AI 调用记录 · 人民币预估费用' : 'AI calls · CNY estimates'}</SheetTitle><SheetDescription className="text-xs">北京时间；费用包含分析与生成。未计价 {costSummary.unpriced || 0} 次，待核实 {costSummary.unknown || 0} 次。历史未核验 {costSummary.legacy?.total || 0} 条，未并入当前合计。</SheetDescription></SheetHeader>
      <div className="px-5 py-2"><Button variant="link" size="sm" className="h-auto whitespace-normal p-0 text-xs" onClick={() => { const source = historySource === 'native' ? 'legacy' : 'native'; setHistorySource(source); setRecordsPage(1); onLoadRecords(1, source); }}>{historySource === 'native' ? '查看未核验历史（历史上报估算）' : '返回新口径调用'}</Button></div>
      <div className="grid grid-cols-3 gap-3 border-y border-border bg-muted/50 px-5 py-4">{[[zh ? '今日' : 'Today', costSummary.today], [zh ? '本月' : 'Month', costSummary.month], [zh ? '总计' : 'Total', costSummary.total]].map(([label, cost]) => <div className="text-center" key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatCost(cost as number)}</p></div>)}</div>
      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'records' | 'images')} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-5 mt-3 self-start"><TabsTrigger value="records" className="gap-2"><Clock size={14} />{zh ? '记录' : 'Records'} ({recordsTotal})</TabsTrigger><TabsTrigger value="images" className="gap-2"><ImageIcon size={14} />{zh ? '图片' : 'Images'} ({imagesTotal})</TabsTrigger></TabsList>
        <TabsContent value="records" className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {!records.length ? <p className="py-12 text-center text-sm text-muted-foreground">{zh ? '暂无记录' : 'No records yet'}</p> : <div className="space-y-2">{records.map(record => {
            const success = record.status === 'success';
            const mode = MODE_LABELS[record.mode] || { zh: record.mode, en: record.mode };
            return <div key={record.id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${success ? 'border-border bg-card' : 'border-danger/30 bg-destructive/5'}`}>
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${success ? 'bg-success' : 'bg-danger'}`} /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{zh ? mode.zh : mode.en}</p><p className="break-all text-[11px] text-muted-foreground">{record.model} · {formatDate(record.createdAt)}</p></div><span className={`shrink-0 text-xs font-semibold ${success ? 'text-foreground' : 'text-danger'}`}>{success ? formatCost(record.cost) : (({ failed: '失败', pending: '处理中', unknown: '待核实', error: '历史失败' } as Record<string, string>)[record.status] || record.status)}</span>
            </div>;
          })}</div>}
        </TabsContent>
        <TabsContent value="images" className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {!savedImages.length ? <p className="py-12 text-center text-sm text-muted-foreground">{zh ? '暂无图片' : 'No images yet'}</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{savedImages.map(image => {
            const imageUrl = getChromaImageUrl(image.id);
            return <div key={image.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
              <Button variant="ghost" className="block h-full w-full p-0" aria-label={`${zh ? '预览' : 'Preview'} ${image.originalName || 'Generated'}`} onClick={() => setPreviewImage(imageUrl)}><img src={imageUrl} alt={image.originalName || 'Generated'} className="h-full w-full object-cover" /></Button>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-card/95 p-1.5 text-card-foreground"><span className="truncate text-[10px]">{formatDate(image.createdAt)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-danger" aria-label={`${zh ? '删除' : 'Delete'} ${image.originalName || 'Generated'}`} onClick={() => onDeleteImage(image.id)}><Trash2 size={14} /></Button></div>
            </div>;
          })}</div>}
        </TabsContent>
      </Tabs>
      {pages > 1 && <div className="flex items-center justify-center gap-3 border-t border-border px-5 py-3"><Button variant="outline" size="icon" disabled={page <= 1} aria-label={zh ? '上一页' : 'Previous page'} onClick={() => handlePage(page - 1)}><ChevronLeft size={16} /></Button><span className="text-xs text-muted-foreground">{page} / {pages}</span><Button variant="outline" size="icon" disabled={page >= pages} aria-label={zh ? '下一页' : 'Next page'} onClick={() => handlePage(page + 1)}><ChevronRight size={16} /></Button></div>}
      <Dialog open={previewImage !== null} onOpenChange={next => { if (!next) setPreviewImage(null); }}><DialogContent className="flex max-h-[95vh] w-[calc(100%-2rem)] max-w-5xl items-center justify-center bg-card p-3" closeLabel={zh ? '关闭图片预览' : 'Close image preview'}><DialogTitle className="sr-only">{zh ? '图片预览' : 'Image preview'}</DialogTitle><DialogDescription className="sr-only">{zh ? '查看已生成的图片' : 'View the generated image'}</DialogDescription>{previewImage && <img src={previewImage} alt={zh ? '图片预览' : 'Image preview'} className="max-h-[85vh] max-w-full rounded-lg object-contain" />}</DialogContent></Dialog>
    </SheetContent>
  </Sheet>;
};
export default GenerationHistory;
