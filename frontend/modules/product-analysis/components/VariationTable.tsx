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
      <div className="pa-empty" style={{ flexDirection: 'column', gap: 8 }}>
        <PackageX size={28} />
        <p className="text-xs">{strings.chart.noVariations}</p>
      </div>
    );
  }

  return (
    <div className="pa-table-wrap max-h-[420px]">
      <table className="pa-table text-xs">
        <thead>
          <tr>
            <th>{strings.variationTable.name}</th>
            <th>{strings.variationTable.sku}</th>
            <th>{strings.variationTable.status}</th>
            {SORTABLE_COLUMNS.map((column) => (
              <th
                key={column}
                className="pa-th-num cursor-pointer select-none"
                aria-sort={sortColumn === column ? 'descending' : 'none'}
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
            >
              <td className="max-w-[220px] truncate font-medium" style={{ color: 'var(--text-primary)' }} title={variation.variationName}>
                {variation.variationName ?? '—'}
              </td>
              <td className="font-mono" style={{ color: 'var(--text-tertiary)' }}>{variation.variationSku ?? '—'}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{variation.variationStatus ?? '—'}</td>
              <td className="text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCount(variation.unitsOrdered ?? null)}</td>
              <td className="text-right" style={{ color: 'var(--text-secondary)' }}>{formatCount(variation.unitsConfirmed ?? null)}</td>
              <td className="text-right" style={{ color: 'var(--text-secondary)' }}>{formatCount(variation.buyersOrdered ?? null)}</td>
              <td className="text-right" style={{ color: 'var(--text-secondary)' }}>{formatCount(variation.cartUnits ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
