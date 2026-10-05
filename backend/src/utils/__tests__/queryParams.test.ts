import { parsePagination, parseQueryInteger } from '../queryParams';

describe('query integer parsing', () => {
  it('supports separate zero-based offsets and one-based pages', () => {
    expect(parseQueryInteger('0', 0, 0, 100)).toBe(0);
    expect(parseQueryInteger('0', 1, 1, 100)).toBeNull();
    expect(parseQueryInteger(undefined, -1, 0, 100)).toBe(-1);
    expect(parsePagination({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50, skip: 50 });
  });

  it.each(['1x', '-1', '1.5', ' 1 ', '', ['1'], {}, true, '9007199254740992'])(
    'rejects an incomplete, compound or unsafe value %p', value => {
      expect(parseQueryInteger(value, 1, 1, 100)).toBeNull();
    },
  );
});
