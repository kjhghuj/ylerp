import React from 'react';
import { useProductAnalysisStrings } from '../../i18n';
import { usePaTheme } from '../../themeContext';
import type { ParentProduct } from '../../types';
import { ComparisonChart } from './ComparisonChart';
import { finiteMetric } from './chartState';

export const OrderStatusCompareChart: React.FC<{ item: ParentProduct }> = ({ item }) => {
  const strings = useProductAnalysisStrings();
  const { theme } = usePaTheme();
  const stripSuffix = (label: string) => label.replace(/\s*[(（](?:已下|已确认|ord\.|conf\.)[)）]\s*/g, '');
  return <ComparisonChart id="order-compare" title={strings.chart.orderCompare} data={[
    { id: 'orders', name: stripSuffix(strings.metrics.ordersOrdered), ordered: finiteMetric(item.ordersOrdered), confirmed: finiteMetric(item.ordersConfirmed) },
    { id: 'units', name: stripSuffix(strings.metrics.unitsOrdered), ordered: finiteMetric(item.unitsOrdered), confirmed: finiteMetric(item.unitsConfirmed) },
    { id: 'buyers', name: stripSuffix(strings.metrics.buyersOrdered), ordered: finiteMetric(item.buyersOrdered), confirmed: finiteMetric(item.buyersConfirmed) },
  ]} legends={[
    { key: 'ordered', label: strings.chart.seriesOrdered, color: theme.chart.primary },
    { key: 'confirmed', label: strings.chart.seriesConfirmed, color: theme.chart.secondary },
  ]} />;
};
