import { describe, expect, it } from 'vitest';
import { rankRestockTargetSkus } from '../modules/restock/utils/restockTargetSku';

describe('rankRestockTargetSkus', () => {
  const targets = [
    { id: '1', sku: 'FPG-BLACK' },
    { id: '2', sku: 'FPG-WHITE' },
    { id: '3', sku: 'FPG-WIHTE' },
    { id: '4', sku: 'LOCAL-1' },
  ];

  it('places SKU-only exact and similar suggestions first without selecting one automatically', () => {
    const ranked = rankRestockTargetSkus('FPG_wihte', targets);

    expect(ranked.map(target => target.sku)).toEqual([
      'FPG-WIHTE', 'FPG-WHITE', 'FPG-BLACK', 'LOCAL-1',
    ]);
    expect(ranked[0].matchPercentage).toBe(100);
    expect(ranked[1].matchPercentage).toBe(75);
    expect(ranked[3].matchPercentage).toBeLessThan(50);
  });

  it('treats separator-only differences as a 100-percent SKU match', () => {
    const [suggestion] = rankRestockTargetSkus(' x8_black\t', [{ id: '1', sku: 'X8-BLACK' }]);

    expect(suggestion.matchPercentage).toBe(100);
  });

  it('returns a bounded percentage for non-exact candidates', () => {
    const [suggestion] = rankRestockTargetSkus('X8-BLACQ', [{ id: '1', sku: 'X8-BLACK' }]);

    expect(suggestion.matchPercentage).toBe(86);
  });

  it('filters only by the explicit SKU search term rather than product title or specification', () => {
    expect(rankRestockTargetSkus('FPG_wihte', targets, 'black').map(target => target.sku)).toEqual(['FPG-BLACK']);
    expect(rankRestockTargetSkus('FPG_wihte', targets, 'manual').map(target => target.sku)).toEqual([]);
  });
});
