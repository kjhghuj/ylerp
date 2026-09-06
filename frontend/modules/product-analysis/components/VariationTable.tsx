import React, { useMemo, useState } from 'react';
import { ArrowUpDown, PackageX } from 'lucide-react';
import { formatCount } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { ProductVariation } from '../types';

interface VariationTableProps {
  variations: ProductVariation[];
}

type SortableColumn = 'unitsOrdered' | 'unitsConfirmed' | 'buyersOrdered' | 'cartUnits';
const SORTABLE_COLUMNS: SortableColumn[] = ['unitsOrdered', 'unitsConfirmed', 'buyersOrdered', 'cartUnits'];

/** 变体明细表：列头点击排序（默认已下件数降序） */
export const VariationTable: React.FC<VariationTableProps> = ({ variations }) => {
  const strings = useProductAnalysisStrings();
  const [sortColumn, setSortColumn] = useState<SortableColumn>('unitsOrdered');

  const sorted = useMemo(
    () =>
      [...variations].sort((a, b) => (b[sortColumn] ?? 0) - (a[sortColumn] ?? 0)),
    [variations, sortColumn]
  );

  if (variations.length === 0) {
    return (
      <div className="rounded-2xl border border-white/50 bg-white/70 backdrop-blur-xl p-10 flex flex-col items-center gap-2 text-slate-400">
        <PackageX size={28} />
        <p className="text-xs">{strings.chart.noVariations}</p>
      </div>
    );
  }

  const headerCellStyle = { color: 'var(--text-tertiary)' };

  return (
    <div
      className="rounded-2xl border border-white/50 bg-white/70 backdrop-blur-xl overflow-hidden"
      style={{ borderColor: 'var(--border-light)' }}
    >
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0" style={{ backgroundColor: 'var(--bg-card)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <th className="text-left px-3 py-2.5 font-medium" style={headerCellStyle}>{strings.variationTable.name}</th>
              <th className="text-left px-3 py-2.5 font-medium" style={headerCellStyle}>{strings.variationTable.sku}</th>
              <th className="text-left px-3 py-2.5 font-medium" style={headerCellStyle}>{strings.variationTable.status}</th>
              {SORTABLE_COLUMNS.map((column) => (
                <th
                  key={column}
                  className="text-right px-3 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap"
                  style={{ ...headerCellStyle, color: sortColumn === column ? 'var(--primary)' : undefined }}
                  onClick={() => setSortColumn(column)}
                >
                  <span className="inline-flex items-center gap-1">
                    {strings.variationTable[column]}
                    <ArrowUpDown size={11} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((variation, index) => (
              <tr
                key={variation.variationSku ?? `${variation.variationName ?? 'v'}-${index}`}
                style={{ borderBottom: '1px solid var(--border-light)' }}
                className="hover:bg-black/[0.02]"
              >
                <td className="px-3 py-2 max-w-[220px] truncate font-medium" style={{ color: 'var(--text-primary)' }} title={variation.variationName}>
                  {variation.variationName ?? '—'}
                </td>
                <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-tertiary)' }}>{variation.variationSku ?? '—'}</td>
                <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{variation.variationStatus ?? '—'}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCount(variation.unitsOrdered ?? null)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatCount(variation.unitsConfirmed ?? null)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatCount(variation.buyersOrdered ?? null)}</td>
                <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{formatCount(variation.cartUnits ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
