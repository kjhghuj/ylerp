import { describe, expect, it } from 'vitest';
import {
  aggregatePrimaryProfitTemplates,
  type PrimaryProfitTemplateRecord,
} from '../modules/profit/dashboardProfit';

const snapshot = {
  exchangeRate: 1,
  exchangeRateAt: '2026-07-18T00:00:00.000Z',
};

const standardRecord = (
  id: string,
  revenue: number,
  cost: number,
): PrimaryProfitTemplateRecord => ({
  id,
  productId: `product-${id}`,
  templateId: null,
  name: `Template ${id}`,
  country: 'CNY',
  platform: 'shopee',
  isPrimary: true,
  data: {
    kind: 'standard',
    schemaVersion: 2,
    nodeData: {},
    extraData: snapshot,
  },
  product: {
    id: `product-${id}`,
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    country: 'CN',
    sites: ['CN'],
    cost,
    productWeight: 0,
    supplierInvoice: 'no',
    supplierTaxPoint: 0,
    vatRate: 0,
    corporateIncomeTaxRate: 0,
    siteData: {
      CN: {
        totalRevenue: revenue,
        adROI: 0,
      },
    },
  },
});

const graphRecord = (metricKey?: 'netProfitCNY'): PrimaryProfitTemplateRecord => ({
  ...standardRecord('graph', 100, 0),
  data: {
    kind: 'graph',
    schemaVersion: 2,
    nodeData: {},
    extraData: {},
    graphTemplateId: 'graph-1',
    graphTemplateSnapshot: {
      id: 'graph-1',
      name: 'Graph',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
      nodes: [
        {
          id: 'profit',
          type: 'parameter',
          position: { x: 0, y: 0 },
          data: {
            name: 'Profit',
            valueType: 'number',
            min: -1000,
            max: 1000,
            defaultValue: 50,
          },
        },
        {
          id: 'out',
          type: 'output',
          position: { x: 100, y: 0 },
          data: {
            name: '净利润',
            ...(metricKey ? { metricKey } : {}),
          },
        },
      ],
      edges: [{ id: 'edge', source: 'profit', target: 'out' }],
    },
    graphInputValues: { profit: 50 },
    graphOutputValues: { out: 50 },
  },
});

describe('primary-template dashboard profit aggregation', () => {
  it('weights net profit by total post-coupon revenue instead of averaging percentages', () => {
    const result = aggregatePrimaryProfitTemplates([
      standardRecord('small', 100, 50),
      standardRecord('large', 900, 810),
    ], {});

    expect(result.excluded).toEqual([]);
    expect(result.totalNetProfitCNY).toBe(140);
    expect(result.totalPostCouponRevenueCNY).toBe(1000);
    expect(result.marginPercent).toBeCloseTo(14, 10);
    expect(result.rows).toHaveLength(2);
  });

  it('does not infer a graph metric from an output name', () => {
    const result = aggregatePrimaryProfitTemplates([graphRecord()], {});

    expect(result.rows).toHaveLength(0);
    expect(result.excluded).toEqual([
      expect.objectContaining({ reason: 'missing_net_profit_metric' }),
    ]);
  });

  it('isolates a graph record with a missing executable snapshot', () => {
    const record = standardRecord('broken-graph', 100, 0);
    record.data = {
      kind: 'graph',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
    } as never;

    expect(() => aggregatePrimaryProfitTemplates([record], {})).not.toThrow();
    const result = aggregatePrimaryProfitTemplates([record], {});
    expect(result.rows).toHaveLength(0);
    expect(result.excluded).toEqual([
      expect.objectContaining({ reason: 'graph_execution_error' }),
    ]);
  });

  it('includes a graph only when one output is explicitly marked netProfitCNY', () => {
    const result = aggregatePrimaryProfitTemplates([graphRecord('netProfitCNY')], {});

    expect(result.totalNetProfitCNY).toBe(50);
    expect(result.totalPostCouponRevenueCNY).toBe(100);
    expect(result.marginPercent).toBe(50);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      netProfitCNY: 50,
      postCouponRevenueCNY: 100,
    }));
  });

  it('returns no percentage when no eligible revenue exists', () => {
    const result = aggregatePrimaryProfitTemplates([standardRecord('zero', 0, 0)], {});

    expect(result.marginPercent).toBeNull();
    expect(result.rows).toHaveLength(0);
  });

  it('isolates malformed records without throwing', () => {
    const result = aggregatePrimaryProfitTemplates([
      null,
      { id: 'broken' },
      standardRecord('valid', 100, 50),
    ] as unknown as PrimaryProfitTemplateRecord[], {});

    expect(result.rows).toHaveLength(1);
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'invalid_record' }),
    ]));
  });

  it('does not fall back an unsupported legacy site to the product country', () => {
    const record = { ...standardRecord('unsupported', 100, 50), country: 'ZZZ' };
    const result = aggregatePrimaryProfitTemplates([record], {});

    expect(result.rows).toHaveLength(0);
    expect(result.excluded).toEqual([
      expect.objectContaining({ templateId: 'unsupported', reason: 'unsupported_site' }),
    ]);
  });

  it('excludes graph metrics that exceed the safe dashboard numeric boundary', () => {
    const record = graphRecord('netProfitCNY');
    if (record.data.kind !== 'graph') throw new Error('Expected graph data');
    record.data.graphTemplateSnapshot.nodes[0].data = {
      ...record.data.graphTemplateSnapshot.nodes[0].data,
      min: -Number.MAX_VALUE,
      max: Number.MAX_VALUE,
      defaultValue: Number.MAX_VALUE,
    };
    record.data.graphInputValues.profit = Number.MAX_VALUE;
    record.data.graphOutputValues.out = Number.MAX_VALUE;

    const result = aggregatePrimaryProfitTemplates([record], {});

    expect(result.rows).toHaveLength(0);
    expect(result.excluded).toEqual([
      expect.objectContaining({ reason: 'invalid_net_profit_metric' }),
    ]);
    expect(result.totalNetProfitCNY).toBe(0);
  });

  it('excludes the row that would overflow safe aggregate totals', () => {
    const first = graphRecord('netProfitCNY');
    const second = graphRecord('netProfitCNY');
    second.id = 'graph-2';
    second.productId = 'product-graph-2';
    second.product = { ...second.product, id: 'product-graph-2' };
    if (first.data.kind !== 'graph' || second.data.kind !== 'graph') {
      throw new Error('Expected graph data');
    }
    first.data.graphInputValues.profit = Number.MAX_SAFE_INTEGER;
    first.data.graphOutputValues.out = Number.MAX_SAFE_INTEGER;
    second.data.graphInputValues.profit = 1;
    second.data.graphOutputValues.out = 1;
    for (const record of [first, second]) {
      if (record.data.kind !== 'graph') continue;
      record.data.graphTemplateSnapshot.nodes[0].data = {
        ...record.data.graphTemplateSnapshot.nodes[0].data,
        min: -Number.MAX_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        defaultValue: record.data.graphInputValues.profit,
      };
    }

    const result = aggregatePrimaryProfitTemplates([first, second], {});

    expect(result.totalNetProfitCNY).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.rows).toHaveLength(1);
    expect(result.excluded).toEqual([
      expect.objectContaining({ templateId: 'graph-2', reason: 'aggregate_overflow' }),
    ]);
  });
});
