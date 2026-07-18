import { describe, expect, it } from 'vitest';
import {
  createExchangeRateSnapshot,
  readExchangeRateSnapshot,
  resolveProfitExchangeRate,
} from '../modules/profit/exchangeRateSnapshot';
import { buildPlatformNodeTemplatePayload } from '../modules/profit/templateDataSerializer';
import { DEFAULT_NODE_DATA, type PlatformNode } from '../modules/profit/types';

const node: PlatformNode = {
  id: 'node-1',
  name: 'MY snapshot',
  platform: 'shopee',
  currency: 'MYR',
  data: { ...DEFAULT_NODE_DATA },
};

describe('profit exchange-rate snapshots', () => {
  it('creates an immutable canonical save-time snapshot', () => {
    const snapshot = createExchangeRateSnapshot(0.65, new Date('2026-07-18T08:00:00.000Z'));

    expect(snapshot).toEqual({
      exchangeRate: 0.65,
      exchangeRateAt: '2026-07-18T08:00:00.000Z',
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('serializes the snapshot without adding it to canonical NodeData', () => {
    const snapshot = createExchangeRateSnapshot(0.65, new Date('2026-07-18T08:00:00.000Z'));
    const payload = buildPlatformNodeTemplatePayload(
      node,
      node.name!,
      {},
      null,
      snapshot,
    );

    expect(payload.data).toEqual(expect.objectContaining(snapshot));
    expect(payload.data).toEqual(expect.objectContaining({ schemaVersion: 2, kind: 'standard' }));
    expect(node.data).not.toHaveProperty('exchangeRate');
    expect(node.data).not.toHaveProperty('exchangeRateAt');
  });

  it('uses a valid historical snapshot by default and live rate only when requested', () => {
    const data = {
      kind: 'standard',
      schemaVersion: 2,
      exchangeRate: 0.65,
      exchangeRateAt: '2026-07-18T08:00:00.000Z',
    };

    expect(readExchangeRateSnapshot(data)).toEqual({
      exchangeRate: 0.65,
      exchangeRateAt: '2026-07-18T08:00:00.000Z',
    });
    expect(resolveProfitExchangeRate(data, 0.7, false)).toEqual({
      rate: 0.65,
      source: 'snapshot',
      exchangeRateAt: '2026-07-18T08:00:00.000Z',
    });
    expect(resolveProfitExchangeRate(data, 0.7, true)).toEqual({
      rate: 0.7,
      source: 'live',
      exchangeRateAt: null,
    });
  });

  it('falls back to a valid live rate for legacy or malformed snapshots', () => {
    expect(resolveProfitExchangeRate({}, 0.7, false)).toEqual({
      rate: 0.7,
      source: 'live',
      exchangeRateAt: null,
    });
    expect(resolveProfitExchangeRate({
      exchangeRate: -1,
      exchangeRateAt: 'not-a-date',
    }, 0.7, false)).toEqual({
      rate: 0.7,
      source: 'live',
      exchangeRateAt: null,
    });
  });

  it('rejects invalid save-time rates instead of persisting a fake snapshot', () => {
    expect(() => createExchangeRateSnapshot(0, new Date())).toThrow(/exchange rate/i);
    expect(() => createExchangeRateSnapshot(Number.MIN_VALUE, new Date())).toThrow(/exchange rate/i);
    expect(() => createExchangeRateSnapshot(Number.NaN, new Date())).toThrow(/exchange rate/i);
    expect(() => createExchangeRateSnapshot(Number.MAX_SAFE_INTEGER + 1, new Date())).toThrow(/exchange rate/i);
  });
});
