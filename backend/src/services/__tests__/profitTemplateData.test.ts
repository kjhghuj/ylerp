import {
  GRAPH_EXECUTION_LIMITS,
  ProfitTemplateDataValidationError,
  validateProductProfitTemplateData,
  validateSharedProfitTemplateData,
} from '../profitTemplateData';

const executableFixture = require('../../../../test-fixtures/profit-graph-executable.json');
const formulaPolicyFixture = require('../../../../test-fixtures/profit-graph-formula-policy.json');
const validGraph = () => structuredClone(executableFixture);

describe('profit template data validation', () => {
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
