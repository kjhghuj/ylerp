import {
  GRAPH_EXECUTION_LIMITS,
  MAX_PROFIT_TEMPLATE_DATA_BYTES,
  ProfitTemplateDataValidationError,
  validateProductProfitTemplateData,
  validateSharedProfitTemplateData,
} from '../profitTemplateData';

const executableFixture = require('../../../../test-fixtures/profit-graph-executable.json');
const formulaPolicyFixture = require('../../../../test-fixtures/profit-graph-formula-policy.json');
const validGraph = () => structuredClone(executableFixture);

describe('profit template data validation', () => {
  it.each([0, 1, 2])('retains shipping calculation mode %s and a manual local-currency amount', (mode) => {
    const data = {
      kind: 'standard',
      schemaVersion: 2,
      shippingCalculationMode: mode,
      manualShippingFee: 35.25,
    };

    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it.each([0, Number.MAX_SAFE_INTEGER])('accepts the manual shipping amount boundary %s without requiring a mode', (amount) => {
    const data = { manualShippingFee: amount };
    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it.each([-1, 5, 1.5, '1', null, Infinity, NaN])('rejects invalid shipping calculation mode %s', (mode) => {
    const data = { kind: 'standard', schemaVersion: 2, shippingCalculationMode: mode };
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate(data)).toThrow(
        expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
          message: expect.stringContaining('shippingCalculationMode'),
        }),
      );
    }
  });

  it.each([-1, Number.MAX_SAFE_INTEGER + 1, '20', null, Infinity, NaN])('rejects invalid manual shipping amount %s', (amount) => {
    const data = { kind: 'standard', schemaVersion: 2, manualShippingFee: amount };
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate(data)).toThrow(
        expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
          message: expect.stringContaining('manualShippingFee'),
        }),
      );
    }
  });

  it('retains optional TK metadata and fee inputs without a schema migration', () => {
    const data = { kind: 'standard', schemaVersion: 2, tiktokFeePolicy: { version: 1, presetId: 'PHP', verifiedAt: '2026-10-04' }, tiktokOrderFee: 5, affiliateCommissionRate: 12, shippingServiceFeeRate: 5.5, shippingServiceFeeCap: 100, buyerShippingFee: 30, shippingSubsidy: 10 };
    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it('accepts US TK policy and manual USD logistics in shared and product templates', () => {
    const data = { kind: 'standard', schemaVersion: 2, tiktokFeePolicy: { version: 1, presetId: 'USD', verifiedAt: '2026-10-04' },
      shippingCalculationMode: 2, manualShippingFee: 5.25, platformCommissionRate: 6, transactionFeeRate: 0, buyerShippingFee: 2 };
    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it('retains the optional China cross-border US preset profile through JSON storage', () => {
    const data = { kind: 'standard', schemaVersion: 2, platformCommissionRate: 6, transactionFeeRate: 0,
      tiktokFeePolicy: { version: 1, presetId: 'USD', verifiedAt: '2026-10-04', presetProfile: 'us-cross-border' } };
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(validate(JSON.parse(JSON.stringify(data)))).toEqual(data);
    }
  });

  it.each([
    ['presetId', ['USD']],
    ['presetId', ['manual']],
    ['presetId', []],
    ['presetId', {}],
    ['presetId', null],
    ['presetId', 1],
    ['presetId', true],
    ['version', [1]],
    ['version', '1'],
    ['verifiedAt', ['2026-10-04']],
    ['verifiedAt', null],
    ['presetProfile', ['us-cross-border']],
  ])('rejects non-scalar or mistyped TK policy %s: %j before storage', (field, value) => {
    const data = {
      kind: 'standard', schemaVersion: 2,
      tiktokFeePolicy: { version: 1, presetId: 'USD', verifiedAt: '2026-10-04', [field as string]: value },
    };
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate(JSON.parse(JSON.stringify(data)))).toThrow(`tiktokFeePolicy.${field}`);
    }
  });

  it.each([
    { presetId: 'USD', presetProfile: '3pf' },
    { presetId: 'USD', presetProfile: null },
    { presetId: 'MYR', presetProfile: 'us-cross-border' },
  ])('rejects unsupported or mismatched fee preset profiles %j', fields => {
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate({ tiktokFeePolicy: { version: 1, verifiedAt: '2026-10-04', ...fields } })).toThrow();
    }
  });

  it.each([0, 1, 2])('retains official US direct-mail mode and cargo %s without changing the schema', usDirectCargoType => {
    const data = { kind: 'standard', schemaVersion: 2, shippingCalculationMode: 4, usDirectCargoType, usDirectExtraFee: 1.25 };
    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it.each([{ usDirectCargoType: -1 }, { usDirectCargoType: 0.5 }, { usDirectCargoType: 3 }, { usDirectCargoType: '0' },
    { usDirectExtraFee: -1 }, { usDirectExtraFee: '2' }, { usDirectExtraFee: Infinity }, { usDirectExtraFee: NaN }])('rejects invalid US direct-mail inputs %j', fields => {
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate({ shippingCalculationMode: 4, ...fields })).toThrow();
    }
  });

  it.each([1, 2, 3, 4])('retains segmented US logistics mode %s through JSON storage', localMode => {
    const data = {
      kind: 'standard', schemaVersion: 2,
      tiktokFeePolicy: { version: 1, presetId: 'USD', verifiedAt: '2026-10-04' },
      shippingCalculationMode: 3, usHeadFreightFee: 2.45, usHeadFreightRatePerKg: 6,
      usHeadFreightConfigured: 1, usLocalDeliveryMode: localMode, lastMileFee: 4.2,
      usDestinationRegion: 1, usPackageLengthCm: 15, usPackageWidthCm: 10, usPackageHeightCm: 5,
      usShippingDate: 20261004,
    };
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      const persisted = JSON.parse(JSON.stringify(validate(data)));
      expect(validate(persisted)).toEqual(data);
    }
  });

  it('allows explicitly confirmed zero head freight and no separate local delivery', () => {
    const data = { shippingCalculationMode: 3, usHeadFreightConfigured: 1,
      usHeadFreightFee: 0, usHeadFreightRatePerKg: 0, usLocalDeliveryMode: 4 };
    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it('allows zero or incomplete inactive US settings without changing historical modes', () => {
    const data = { shippingCalculationMode: 2, manualShippingFee: 12, usHeadFreightConfigured: 0,
      usLocalDeliveryMode: 0, usDestinationRegion: 0, usPackageLengthCm: 0,
      usPackageWidthCm: 0, usPackageHeightCm: 0, usShippingDate: 20261004 };
    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it.each([20260920, 20260921, 20261004, 20261005, 20270117, 20270118])('accepts a valid dormant US shipping date %s', date => {
    expect(validateSharedProfitTemplateData({ usShippingDate: date })).toEqual({ usShippingDate: date });
  });

  it.each([20260931, 20261131, 20261004.5, '20261004', null, Infinity, NaN])(
    'rejects invalid US shipping date %s', date => {
      for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
        expect(() => validate({ usShippingDate: date })).toThrow('usShippingDate');
      }
    },
  );

  it.each([20260920, 20270118])('requires a covered date %s only when official LIVE delivery is active', date => {
    const data = { shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 2,
      usDestinationRegion: 1, usPackageLengthCm: 10, usPackageWidthCm: 5,
      usPackageHeightCm: 5, usShippingDate: date };
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate(data)).toThrow('usShippingDate');
      expect(validate({ ...data, usLocalDeliveryMode: 1 })).toEqual({ ...data, usLocalDeliveryMode: 1 });
      expect(validate({ ...data, usLocalDeliveryMode: 4 })).toEqual({ ...data, usLocalDeliveryMode: 4 });
      expect(validate({ ...data, shippingCalculationMode: 2 })).toEqual({ ...data, shippingCalculationMode: 2 });
    }
  });

  it.each([
    { usHeadFreightConfigured: 2 }, { usHeadFreightConfigured: 0.5 }, { usHeadFreightConfigured: '1' },
    { usLocalDeliveryMode: 5 }, { usLocalDeliveryMode: 1.5 }, { usLocalDeliveryMode: null },
    { usDestinationRegion: 3 }, { usDestinationRegion: -1 },
    { usHeadFreightFee: -1 }, { usHeadFreightRatePerKg: Infinity },
    { usPackageLengthCm: Number.MAX_SAFE_INTEGER + 1 }, { usPackageWidthCm: NaN }, { usPackageHeightCm: '5' },
  ])('rejects malformed US shipping inputs: %j', fields => {
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate(fields)).toThrow(ProfitTemplateDataValidationError);
    }
  });

  it.each([
    [{ shippingCalculationMode: 3 }, 'usHeadFreightConfigured'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 0, usLocalDeliveryMode: 4 }, 'usHeadFreightConfigured'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 0 }, 'usLocalDeliveryMode'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 1, lastMileFee: -1 }, 'lastMileFee'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 2, usDestinationRegion: 2 }, 'usDestinationRegion'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 3, usDestinationRegion: 1 }, 'usPackageLengthCm'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 2, usDestinationRegion: 1,
      usPackageLengthCm: 10, usPackageWidthCm: 10, usPackageHeightCm: 0 }, 'usPackageHeightCm'],
    [{ shippingCalculationMode: 3, usHeadFreightConfigured: 1, usLocalDeliveryMode: 3, usDestinationRegion: 1,
      usPackageLengthCm: 10, usPackageWidthCm: 10, usPackageHeightCm: 10 }, 'usShippingDate'],
  ])('rejects incomplete segmented US shipping %j', (data, field) => {
    for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
      expect(() => validate(data)).toThrow(String(field));
    }
  });

  it.each([
    { tiktokFeePolicy: null },
    { tiktokFeePolicy: { version: 2, presetId: 'MYR', verifiedAt: '2026-10-04' } },
    { tiktokFeePolicy: { version: 1, presetId: 'unknown', verifiedAt: '2026-10-04' } },
    { tiktokFeePolicy: { version: 1, presetId: 'THB', verifiedAt: '2026-02-30' } },
    { tiktokFeePolicy: { version: 1, presetId: 'manual', verifiedAt: '2026-10-04' } },
    { affiliateCommissionRate: 101 }, { tiktokOrderFee: -1 }, { shippingSubsidy: Infinity },
  ])('rejects malformed TK policy or fee inputs: %j', (input) => {
    expect(() => validateSharedProfitTemplateData({ kind: 'standard', schemaVersion: 2, ...input })).toThrow(ProfitTemplateDataValidationError);
  });

  describe.each(['platformCommissionRate', 'transactionFeeRate'])('%s storage validation', field => {
    it.each([0, 6, 100])('accepts the valid percentage %s', value => {
      const data = { kind: 'standard', schemaVersion: 2, [field]: value };
      for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
        expect(validate(JSON.parse(JSON.stringify(data)))).toEqual(data);
      }
    });

    it.each([-1, 101, '6', null, Infinity, NaN])('rejects the invalid percentage %s', value => {
      const data = { kind: 'standard', schemaVersion: 2, [field]: value };
      for (const validate of [validateSharedProfitTemplateData, validateProductProfitTemplateData]) {
        expect(() => validate(data)).toThrow(field);
      }
    });
  });

  it('allows historical standard templates without commission or transaction rate fields', () => {
    for (const data of [{ kind: 'standard', schemaVersion: 2 }, {}]) {
      expect(validateSharedProfitTemplateData(data)).toBe(data);
      expect(validateProductProfitTemplateData(data)).toBe(data);
    }
  });

  it('rejects product template payloads above the storage boundary', () => {
    const oversized = {
      kind: 'standard',
      schemaVersion: 2,
      padding: 'x'.repeat(MAX_PROFIT_TEMPLATE_DATA_BYTES),
    };

    expect(() => validateProductProfitTemplateData(oversized)).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining('must not exceed'),
      }),
    );
  });

  it('accepts one explicitly marked net-profit output and preserves the marker', () => {
    const graph = validGraph();
    graph.graphTemplateSnapshot.nodes[3].data.metricKey = 'netProfitCNY';

    expect(validateSharedProfitTemplateData(graph)).toBe(graph);
  });

  it.each([
    ['unknown output metric', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[3].data.metricKey = 'profit';
      return graph;
    }],
    ['metric on a parameter', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[0].data.metricKey = 'netProfitCNY';
      return graph;
    }],
    ['duplicate net-profit metrics', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[3].data.metricKey = 'netProfitCNY';
      graph.graphTemplateSnapshot.nodes.push({
        ...structuredClone(graph.graphTemplateSnapshot.nodes[3]),
        id: 'out-2',
        data: { name: 'Second net profit', metricKey: 'netProfitCNY' },
      });
      graph.graphTemplateSnapshot.edges.push({
        id: 'edge-output-2',
        source: 'formula',
        target: 'out-2',
      });
      graph.graphOutputValues['out-2'] = 6;
      return graph;
    }],
  ])('rejects %s', (_label, factory) => {
    expect(() => validateSharedProfitTemplateData(factory())).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining('metricKey'),
      }),
    );
  });

  it('accepts a complete graph and preserves unknown fields by reference', () => {
    const graph = validGraph();

    expect(validateSharedProfitTemplateData(graph)).toBe(graph);
    expect(validateProductProfitTemplateData(graph)).toBe(graph);
  });

  it.each(
    (formulaPolicyFixture.allowed as Array<{ expression: string; expected: number }>)
      .map(({ expression, expected }) => [expression, expected] as const),
  )(
    'accepts the shared scalar formula policy expression %s',
    (expression, expected) => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.expression = expression;
      graph.graphOutputValues.out = expected;

      expect(validateSharedProfitTemplateData(graph)).toBe(graph);
    },
  );

  it.each((formulaPolicyFixture.rejected as string[]).map(expression => [expression] as const))(
    'rejects non-scalar or stateful formula syntax before evaluation: %s',
    expression => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.expression = expression;

      expect(() => validateSharedProfitTemplateData(graph)).toThrow(
        expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
          message: expect.stringContaining('expression'),
        }),
      );
    },
  );

  it.each([
    ['function argument count', `max(${Array.from({ length: 9 }, () => 'price').join(',')})`],
    ['AST depth', `${'('.repeat(34)}price${')'.repeat(34)}`],
  ])('rejects formulas above the %s complexity limit', (_label, expression) => {
    const graph = validGraph();
    graph.graphTemplateSnapshot.nodes[2].data.expression = expression;

    expect(() => validateSharedProfitTemplateData(graph)).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining('expression'),
      }),
    );
  });

  it.each([
    ['partial graph', () => {
      const graph = validGraph();
      delete (graph as Partial<typeof graph>).graphTemplateSnapshot;
      return graph;
    }, 'graphTemplateSnapshot'],
    ['id mismatch', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.id = 'other';
      return graph;
    }, 'graphTemplateSnapshot.id'],
    ['duplicate node', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes.push({ ...graph.graphTemplateSnapshot.nodes[0] });
      return graph;
    }, 'nodes'],
    ['duplicate edge', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.edges.push({
        ...graph.graphTemplateSnapshot.edges[0],
        source: 'rate',
      });
      return graph;
    }, 'edges'],
    ['bad edge reference', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.edges[0].source = 'missing';
      return graph;
    }, 'edges[0].source'],
    ['cycle', () => {
      const graph = validGraph();
      (graph.graphTemplateSnapshot.nodes[2].data.variables as Array<{ portId: string; label: string }>).push({
        portId: 'loop_in',
        label: 'loop',
      });
      graph.graphTemplateSnapshot.edges.push({
        id: 'cycle',
        source: 'out',
        target: 'formula',
        targetHandle: 'loop_in',
      });
      return graph;
    }, 'edges'],
    ['string numeric input', () => {
      const graph = validGraph();
      (graph.graphInputValues as Record<string, unknown>).price = '100';
      return graph;
    }, 'graphInputValues.price'],
    ['non-finite output', () => {
      const graph = validGraph();
      graph.graphOutputValues.out = Number.POSITIVE_INFINITY;
      return graph;
    }, 'graphOutputValues.out'],
    ['bad formula field', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.expression = '';
      return graph;
    }, 'expression'],
    ['bad formula syntax', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.expression = 'price +';
      return graph;
    }, 'expression'],
    ['unknown formula symbol', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.expression = 'price + missing';
      return graph;
    }, 'missing'],
    ['unbound formula variable', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.edges[0].targetHandle = 'other';
      return graph;
    }, 'variables[0]'],
    ['missing node position', () => {
      const graph = validGraph();
      delete graph.graphTemplateSnapshot.nodes[0].position;
      return graph;
    }, 'position'],
    ['missing snapshot createdAt', () => {
      const graph = validGraph();
      delete graph.graphTemplateSnapshot.createdAt;
      return graph;
    }, 'createdAt'],
    ['missing snapshot updatedAt', () => {
      const graph = validGraph();
      delete graph.graphTemplateSnapshot.updatedAt;
      return graph;
    }, 'updatedAt'],
    ['blank input record key', () => {
      const graph = validGraph();
      graph.graphInputValues[' '] = 1;
      return graph;
    }, 'graphInputValues'],
    ['blank output record key', () => {
      const graph = validGraph();
      graph.graphOutputValues[''] = 1;
      return graph;
    }, 'graphOutputValues'],
    ['missing output node', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes = graph.graphTemplateSnapshot.nodes.filter(
        (node: { type: string }) => node.type !== 'output',
      );
      graph.graphTemplateSnapshot.edges = graph.graphTemplateSnapshot.edges.filter(
        (edge: { target: string }) => edge.target !== 'out',
      );
      graph.graphOutputValues = { formula: 6 };
      return graph;
    }, 'output'],
  ])('rejects %s with a concrete field', (_label, factory, field) => {
    expect(() => validateSharedProfitTemplateData(factory())).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining(field),
      }),
    );
  });

  it('accepts standard and legacy flat records', () => {
    expect(validateSharedProfitTemplateData({
      kind: 'standard',
      schemaVersion: 2,
      platformCommissionRate: 6,
    })).toEqual(expect.objectContaining({ kind: 'standard' }));
    expect(validateSharedProfitTemplateData({ platformCommissionRate: 6 })).toEqual({
      platformCommissionRate: 6,
    });
  });

  it('accepts an optional complete exchange-rate snapshot on standard templates', () => {
    const data = {
      kind: 'standard',
      schemaVersion: 2,
      platformCommissionRate: 6,
      exchangeRate: 0.65,
      exchangeRateAt: '2026-07-18T08:00:00.000Z',
    };

    expect(validateSharedProfitTemplateData(data)).toBe(data);
    expect(validateProductProfitTemplateData(data)).toBe(data);
  });

  it.each([
    [{ exchangeRate: 0.65 }, 'exchangeRateAt'],
    [{ exchangeRateAt: '2026-07-18T08:00:00.000Z' }, 'exchangeRate'],
    [{ exchangeRate: 0, exchangeRateAt: '2026-07-18T08:00:00.000Z' }, 'exchangeRate'],
    [{ exchangeRate: -1, exchangeRateAt: '2026-07-18T08:00:00.000Z' }, 'exchangeRate'],
    [{ exchangeRate: Number.MIN_VALUE, exchangeRateAt: '2026-07-18T08:00:00.000Z' }, 'exchangeRate'],
    [{ exchangeRate: Number.MAX_SAFE_INTEGER + 1, exchangeRateAt: '2026-07-18T08:00:00.000Z' }, 'exchangeRate'],
    [{ exchangeRate: '0.65', exchangeRateAt: '2026-07-18T08:00:00.000Z' }, 'exchangeRate'],
    [{ exchangeRate: 0.65, exchangeRateAt: 'not-a-date' }, 'exchangeRateAt'],
    [{ exchangeRate: 0.65, exchangeRateAt: '2026-07-18' }, 'exchangeRateAt'],
  ])('rejects an incomplete or invalid standard exchange-rate snapshot %#', (snapshot, field) => {
    expect(() => validateSharedProfitTemplateData({
      kind: 'standard',
      schemaVersion: 2,
      ...snapshot,
    })).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining(field),
      }),
    );
  });

  it.each([
    [{ kind: 'future', schemaVersion: 2, future: true }, 'kind'],
    [{ kind: 'standard', schemaVersion: 3, platformCommissionRate: 6 }, 'schemaVersion'],
    [{ schemaVersion: 3, platformCommissionRate: 6 }, 'schemaVersion'],
    [{
      kind: 'standard',
      schemaVersion: 2,
      graphTemplateId: 'partial',
      platformCommissionRate: 6,
    }, 'graphTemplateSnapshot'],
  ])('rejects unknown shared-template kind/version and partial graph claims', (data, field) => {
    expect(() => validateSharedProfitTemplateData(data)).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining(field),
      }),
    );
  });

  it('rejects arbitrary future kinds for product templates unless explicitly wrapped as invalid', () => {
    expect(() => validateProductProfitTemplateData({
      kind: 'future',
      schemaVersion: 99,
      future: true,
    })).toThrow(/kind/);
  });

  it.each([
    ['node count', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes = Array.from(
        { length: GRAPH_EXECUTION_LIMITS.maxNodes + 1 },
        (_, index) => ({
          id: `input-${index}`,
          type: 'parameter',
          position: { x: index, y: 0 },
          data: {
            name: `Input ${index}`,
            valueType: 'number',
            min: 0,
            max: 1,
            defaultValue: 0,
          },
        }),
      );
      graph.graphTemplateSnapshot.edges = [];
      graph.graphInputValues = { 'input-0': 0 };
      graph.graphOutputValues = { out: 0 };
      return graph;
    }, 'nodes'],
    ['edge count', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.edges = Array.from(
        { length: GRAPH_EXECUTION_LIMITS.maxEdges + 1 },
        (_, index) => ({
          id: `edge-${index}`,
          source: 'price',
          target: 'formula',
          targetHandle: 'price_in',
        }),
      );
      return graph;
    }, 'edges'],
    ['formula variable count', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.variables = Array.from(
        { length: GRAPH_EXECUTION_LIMITS.maxVariablesPerFormula + 1 },
        (_, index) => ({ portId: `p-${index}`, label: `v${index}` }),
      );
      return graph;
    }, 'variables'],
    ['expression length', () => {
      const graph = validGraph();
      graph.graphTemplateSnapshot.nodes[2].data.expression = '1+'.repeat(
        Math.ceil(GRAPH_EXECUTION_LIMITS.maxExpressionLength / 2),
      ) + '1';
      return graph;
    }, 'expression'],
  ])('rejects executable graph above the %s limit', (_label, factory, field) => {
    expect(() => validateSharedProfitTemplateData(factory())).toThrow(
      expect.objectContaining<Partial<ProfitTemplateDataValidationError>>({
        message: expect.stringContaining(field),
      }),
    );
  });

  it('allows explicit invalid payloads only for product compatibility storage', () => {
    const invalid = {
      kind: 'invalid',
      schemaVersion: 99,
      compatibilityEnvelope: true,
      rawData: { graphTemplateId: 'future-graph', custom: true },
    };

    expect(validateProductProfitTemplateData(invalid)).toBe(invalid);
    expect(() => validateSharedProfitTemplateData(invalid)).toThrow(/kind/);
  });
});
