import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trash2, Loader2, Search, ArrowUpDown } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { UploadZone } from './components/UploadZone';
import { SummaryCards } from './components/SummaryCards';
import { ProductCardGrid } from './components/ProductCardGrid';
import { ProductDetailModal } from './modals/ProductDetailModal';
import {
  createProductAnalysisReport,
  deleteProductAnalysisReport,
  fetchProductAnalysisReport,
  fetchProductAnalysisReports,
  getApiErrorDetail,
} from './services/productAnalysisApi';
import {
  ProductAnalysisParseError,
  parseProductAnalysisWorkbook,
  validateProductAnalysisFile,
} from './utils/excelParser';
import { compareByMetric, matchesSearch, summarizeSheet } from './utils/format';
import { useProductAnalysisStrings } from './i18n';
import type { ParentProduct, ReportDetail, ReportMeta, SheetKey } from './types';

const CARD_PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 300;
type SortKey = 'salesOrdered' | 'ordersOrdered' | 'visitors' | 'cvrConfirmed' | 'clicks';
const SORT_KEYS: SortKey[] = ['salesOrdered', 'ordersOrdered', 'visitors', 'cvrConfirmed', 'clicks'];

export const ProductAnalysis: React.FC = () => {
  const { showToast } = useToast();
  const strings = useProductAnalysisStrings();

  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [activeReport, setActiveReport] = useState<ReportDetail | null>(null);
  const [activeSheetKey, setActiveSheetKey] = useState<SheetKey>('hot');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('salesOrdered');
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [isUploading, setIsUploading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ParentProduct | null>(null);

  const loadReport = React.useCallback(async (id: string) => {
    const detail = await fetchProductAnalysisReport(id);
    setActiveReport(detail);
    setActiveSheetKey(detail.data.sheets[0]?.sheetKey ?? 'hot');
  }, []);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const list = await fetchProductAnalysisReports();
        if (isCancelled) return;
        setReports(list);
        if (list.length > 0) await loadReport(list[0].id);
      } catch (error) {
        if (!isCancelled) showToast(getApiErrorDetail(error), 'error');
      } finally {
        if (!isCancelled) setIsInitialLoading(false);
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    try {
      validateProductAnalysisFile(file);
      const buffer = await file.arrayBuffer();
      const parsed = parseProductAnalysisWorkbook(buffer, file.name);
      const created = await createProductAnalysisReport(parsed);
      const list = await fetchProductAnalysisReports();
      setReports(list);
      await loadReport(created.id);
      showToast(`${created.itemCount} ${strings.resultCount}`);
    } catch (error) {
      const message =
        error instanceof ProductAnalysisParseError ? error.message : getApiErrorDetail(error);
      showToast(message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteActive = async () => {
    if (!activeReport) return;
    if (!window.confirm(strings.deleteConfirm)) return;
    try {
      await deleteProductAnalysisReport(activeReport.id);
      const list = await fetchProductAnalysisReports();
      setReports(list);
      if (list.length > 0) {
        await loadReport(list[0].id);
      } else {
        setActiveReport(null);
      }
      showToast(strings.deleteReport + ' ✓');
    } catch (error) {
      showToast(getApiErrorDetail(error), 'error');
    }
  };

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 切换筛选条件时重置分页
  useEffect(() => {
    setVisibleCount(CARD_PAGE_SIZE);
  }, [activeReport?.id, activeSheetKey, debouncedSearch, sortKey]);

  const activeSheet = useMemo(
    () => activeReport?.data.sheets.find((sheet) => sheet.sheetKey === activeSheetKey) ?? null,
    [activeReport, activeSheetKey]
  );
  const summary = useMemo(
    () => (activeSheet ? summarizeSheet(activeSheet) : null),
    [activeSheet]
  );
  const filteredItems = useMemo(() => {
    if (!activeSheet) return [];
    return activeSheet.items
      .filter((item) => matchesSearch(item, debouncedSearch))
      .sort(compareByMetric(sortKey));
  }, [activeSheet, debouncedSearch, sortKey]);

  if (isInitialLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <UploadZone onFileSelected={handleFileSelected} isUploading={isUploading} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {reports.length > 0 && (
          <>
            <label className="font-medium" style={{ color: 'var(--text-secondary)' }} htmlFor="report-select">
              {strings.historyLabel}
            </label>
            <select
              id="report-select"
              value={activeReport?.id ?? ''}
              onChange={(event) => {
                const id = event.target.value;
                if (id) loadReport(id).catch((error) => showToast(getApiErrorDetail(error), 'error'));
              }}
              className="rounded-lg border px-2 py-1.5 max-w-xs truncate"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-light)',
                color: 'var(--text-primary)',
              }}
            >
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.fileName}（{report.itemCount}）
                </option>
              ))}
            </select>
            {activeReport && (
              <button
                type="button"
                onClick={handleDeleteActive}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors duration-200"
                style={{ borderColor: 'var(--border-light)', color: '#dc2626' }}
              >
                <Trash2 size={13} />
                {strings.deleteReport}
              </button>
            )}
          </>
        )}
        {activeReport && (
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {activeReport.periodStart && activeReport.periodEnd
              ? `${activeReport.periodStart} ~ ${activeReport.periodEnd}`
              : strings.periodUnknown}
            {' · '}
            {activeReport.currency}
          </span>
        )}
      </div>

      {activeReport && activeReport.data.warnings.length > 0 && (
        <div
          className="flex items-start gap-2 rounded-xl border p-3 text-xs"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <div className="min-w-0">
            <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{strings.warnings}</p>
            {activeReport.data.warnings.map((warning, index) => (
              <p key={index} className="truncate" title={warning}>{warning}</p>
            ))}
          </div>
        </div>
      )}

      {activeReport && activeSheet && summary ? (
        <>
          <div className="flex flex-wrap gap-2">
            {activeReport.data.sheets.map((sheet) => {
              const isActive = sheet.sheetKey === activeSheetKey;
              return (
                <button
                  key={sheet.sheetKey}
                  type="button"
                  onClick={() => setActiveSheetKey(sheet.sheetKey)}
                  className="px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-colors duration-200"
                  style={{
                    backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-card)',
                    borderColor: isActive ? 'var(--primary)' : 'var(--border-light)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {sheet.sheetName}（{sheet.items.length}）
                </button>
              );
            })}
          </div>

          <SummaryCards summary={summary} currency={activeReport.currency} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={strings.searchPlaceholder}
                className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ArrowUpDown size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="rounded-lg border px-2 py-1.5"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)',
                }}
              >
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>{strings.sortOptions[key]}</option>
                ))}
              </select>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {filteredItems.length} {strings.resultCount}
            </span>
          </div>

          <ProductCardGrid
            items={filteredItems}
            currency={activeReport.currency}
            visibleCount={visibleCount}
            onSelect={setSelectedItem}
            onLoadMore={() => setVisibleCount((count) => count + CARD_PAGE_SIZE)}
          />
        </>
      ) : (
        reports.length === 0 && (
          <div
            className="rounded-2xl border p-12 text-center text-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
          >
            {strings.noReports}
          </div>
        )
      )}

      {selectedItem && activeReport && activeSheet && (
        <ProductDetailModal
          item={selectedItem}
          report={activeReport}
          sheetKey={activeSheet.sheetKey}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};
