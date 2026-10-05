import { FinanceInputError, parseFinanceInput, parseFinanceMonth } from '../financeInput';

const input = { date: '2026-10-01', type: 'income', amount: 10, category: 'sale', description: '', accountId: 'main' };

describe('finance input mapping', () => {
  it('keeps only business fields and never passes nested relations or audit identifiers to Prisma', () => {
    expect(parseFinanceInput({ ...input, id: 'client', userId: 'other', updatedBy: 'spoof', user: { connect: { id: 'other' } } }))
      .toEqual({ ...input, date: new Date('2026-10-01') });
  });

  it('supports partial edits and existing signed or zero amounts', () => {
    expect(parseFinanceInput({ description: '', amount: -1 }, true)).toEqual({ description: '', amount: -1 });
    expect(parseFinanceInput({ amount: 0 }, true)).toEqual({ amount: 0 });
  });

  it.each([null, [], { ...input, amount: Infinity }, { ...input, amount: NaN },
    { ...input, date: '2026-02-30T00:00:00.000Z' }, { ...input, date: '2026-10-01T24:00:00Z' },
    { ...input, category: null }, { ...input, type: '' }])('rejects invalid input %p', value => {
    expect(() => parseFinanceInput(value)).toThrow(FinanceInputError);
  });

  it('accepts date-only and standard timezone-aware ISO timestamps', () => {
    expect(parseFinanceInput({ ...input, date: '2026-10-01T10:20:30.000Z' }).date).toEqual(new Date('2026-10-01T10:20:30.000Z'));
    expect(parseFinanceInput({ ...input, date: '2026-10-01T10:20:30+08:00' }).date).toEqual(new Date('2026-10-01T02:20:30Z'));
  });

  it('retains local month boundaries across the year rollover and handles years below 100', () => {
    expect(parseFinanceMonth('2026-12')).toEqual({ startDate: new Date(2026, 11, 1), endDate: new Date(2027, 0, 1) });
    expect(parseFinanceMonth('0099-12').startDate.getFullYear()).toBe(99);
    expect(parseFinanceMonth('0099-12').endDate.getFullYear()).toBe(100);
  });
});
