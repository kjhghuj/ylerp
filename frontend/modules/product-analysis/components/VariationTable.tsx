import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../../components/ui/table';
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
      <Table wrapped={false} className="pa-table text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>{strings.variationTable.name}</TableHead>
            <TableHead>{strings.variationTable.sku}</TableHead>
            <TableHead>{strings.variationTable.status}</TableHead>
            {SORTABLE_COLUMNS.map((column) => (
              <TableHead
                key={column}
                className="pa-th-num cursor-pointer select-none"
                aria-sort={sortColumn === column ? 'descending' : 'none'}
                onClick={() => setSortColumn(column)}
              >
                <span className="inline-flex items-center gap-1">
                  {strings.variationTable[column]}
                  <ArrowUpDown size={11} />
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((variation, index) => (
            <TableRow
              key={variation.variationSku ?? `${variation.variationName ?? 'v'}-${index}`}
            >
              <TableCell className="max-w-[220px] truncate font-medium" style={{ color: 'hsl(var(--ui-foreground))' }} title={variation.variationName}>
                {variation.variationName ?? '—'}
              </TableCell>
              <TableCell className="font-mono" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{variation.variationSku ?? '—'}</TableCell>
              <TableCell style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{variation.variationStatus ?? '—'}</TableCell>
              <TableCell className="text-right font-semibold" style={{ color: 'hsl(var(--ui-foreground))' }}>{formatCount(variation.unitsOrdered ?? null)}</TableCell>
              <TableCell className="text-right" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{formatCount(variation.unitsConfirmed ?? null)}</TableCell>
              <TableCell className="text-right" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{formatCount(variation.buyersOrdered ?? null)}</TableCell>
              <TableCell className="text-right" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{formatCount(variation.cartUnits ?? null)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
