import { createHash } from 'node:crypto';
import { hashCanonicalJson } from '../productAnalysisSourceHash';

describe('hashCanonicalJson', () => {
  test('matches the canonical JSON digest without materializing one large JSON string', () => {
    const value = [{
      rows: [{ cells: [{ value: '商品 A', column: 1 }], rowNumber: 2 }],
      sheetName: '热销商品',
      sheetIndex: 0,
    }];
    const canonical = '[{"rows":[{"cells":[{"column":1,"value":"商品 A"}],"rowNumber":2}],"sheetIndex":0,"sheetName":"热销商品"}]';

    expect(hashCanonicalJson(value)).toBe(createHash('sha256').update(canonical).digest('hex'));
  });

  test('is stable when object keys arrive in a different insertion order', () => {
    const first = { b: [{ y: 2, x: 1 }], a: 'value' };
    const second = { a: 'value', b: [{ x: 1, y: 2 }] };

    expect(hashCanonicalJson(first)).toBe(hashCanonicalJson(second));
  });
});
