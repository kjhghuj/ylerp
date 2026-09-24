import React from 'react';
import { useProductAnalysisStrings } from '../../i18n';
import { usePaTheme } from '../../themeContext';
import type { ProductVariation } from '../../types';
import { ComparisonChart } from './ComparisonChart';
import { finiteMetric } from './chartState';

export const VariationUnitsChart: React.FC<{ variations: ProductVariation[] }> = ({ variations }) => {
  const strings = useProductAnalysisStrings();
  const { theme } = usePaTheme();
  const nameCounts = new Map<string, number>();
  const data = [...variations].sort((a, b) => (finiteMetric(b.unitsOrdered) ?? 0) - (finiteMetric(a.unitsOrdered) ?? 0)).slice(0, 12).map((variation, index) => {
    const name = variation.variationName?.trim() || `#${index + 1}`;
    const seen = (nameCounts.get(name) ?? 0) + 1;
    nameCounts.set(name, seen);
    return { id: String(index), name: seen > 1 ? `${name} (${seen})` : name, ordered: finiteMetric(variation.unitsOrdered), confirmed: finiteMetric(variation.unitsConfirmed) };
  });
  return <ComparisonChart id="variation-units" title={strings.chart.variationUnits} data={data} vertical legends={[
    { key: 'ordered', label: strings.variationTable.unitsOrdered, color: theme.chart.primary },
    { key: 'confirmed', label: strings.variationTable.unitsConfirmed, color: theme.chart.secondary },
  ]} />;
};
