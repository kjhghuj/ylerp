import {
  isSuspectedRangeFileName,
  isValidCalendarDate,
  validateDailyUploadPayload,
  validatePeriodMatchesDate,
} from '../../services/productAnalysisUpload';

describe('isValidCalendarDate', () => {
  test('accepts real calendar dates', () => {
    expect(isValidCalendarDate('2026-09-06')).toBe(true);
    expect(isValidCalendarDate('2024-02-29')).toBe(true); // 闰年
    expect(isValidCalendarDate('2026-12-31')).toBe(true);
  });

  test('rejects rollover and malformed dates', () => {
    // 回归：2026-02-31 曾被 JS Date 溢出成 2026-03-03
    expect(isValidCalendarDate('2026-02-31')).toBe(false);
    expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 非闰年
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('2026-9-6')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});

describe('validateDailyUploadPayload', () => {
  const validSheets = [{ sheetKey: 'hot' as const, items: [{ itemId: '10001', itemName: 'Keyboard', visitors: 100 }] }];

  test('accepts a well-formed payload and normalizes optional fields', () => {
    const outcome = validateDailyUploadPayload({
      fileName: ' a.xlsx ',
      periodStart: '2026-09-06',
      periodEnd: '2026-09-06',
      currency: null,
      warnings: ['w'],
      sheets: validSheets,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.fileName).toBe('a.xlsx');
      expect(outcome.value.currency).toBeNull();
      expect(outcome.value.warnings).toEqual(['w']);
      expect(outcome.value.sheets[0].items[0].visitors).toBe(100);
    }
  });

  test('rejects null sheet entries, illegal sheet keys and wrong item types with detail', () => {
    const cases: unknown[] = [
      { fileName: 'a.xlsx', sheets: [null, validSheets[0]] },
      { fileName: 'a.xlsx', sheets: [{ sheetKey: 'ads', items: [] }] },
      { fileName: 'a.xlsx', sheets: [{ sheetKey: 'hot', items: [{ itemId: 123, itemName: 'x' }] }] },
      { fileName: 'a.xlsx', sheets: [{ sheetKey: 'hot', items: [{ itemId: 'ok', visitors: 'NaN-ish' }] }] },
      { fileName: 'a.xlsx', sheets: [] },
      { fileName: '', sheets: validSheets },
      'not-an-object',
    ];
    for (const payload of cases) {
      const outcome = validateDailyUploadPayload(payload);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.detail.length).toBeGreaterThan(0);
    }
  });

  test('accepts legitimate zero and negative numbers, and missing metrics', () => {
    const outcome = validateDailyUploadPayload({
      fileName: 'a.xlsx',
      sheets: [{
        sheetKey: 'hot',
        items: [
          { itemId: 'a', itemName: 'Zero', visitors: 0, clicks: 0 },
          { itemId: 'b', itemName: 'Refund', salesOrdered: -12.5 },
        ],
      }],
    });
    expect(outcome.ok).toBe(true);
  });

  test('enforces count and length caps', () => {
    const tooManySheets = Array.from({ length: 9 }, () => validSheets[0]);
    expect(validateDailyUploadPayload({ fileName: 'a.xlsx', sheets: tooManySheets }).ok).toBe(false);
    const longName = { fileName: 'x'.repeat(256), sheets: validSheets };
    expect(validateDailyUploadPayload(longName).ok).toBe(false);
    const longItemId = { fileName: 'a.xlsx', sheets: [{ sheetKey: 'hot', items: [{ itemId: '9'.repeat(101), itemName: 'x' }] }] };
    expect(validateDailyUploadPayload(longItemId).ok).toBe(false);
  });
});

describe('validatePeriodMatchesDate (filename × declared × date)', () => {
  test('rejects filenames without a recognizable date when no period is declared (tightened compat)', () => {
    // 回归：两种日期依据都缺失时曾按兼容规则放行，现要求至少提供一种完整依据
    const detail = validatePeriodMatchesDate('report.xlsx', { periodStart: null, periodEnd: null }, '2026-09-06');
    expect(detail).toContain('无可识别日期');
  });

  test('allows unrecognized filenames with a valid same-day declared period equal to the upload date', () => {
    expect(
      validatePeriodMatchesDate('report.xlsx', { periodStart: '2026-09-06', periodEnd: '2026-09-06' }, '2026-09-06')
    ).toBeNull();
  });

  test('passes for single-date filename equal to the upload date', () => {
    expect(validatePeriodMatchesDate('a.20260906.xlsx', { periodStart: null, periodEnd: null }, '2026-09-06')).toBeNull();
  });

  test('passes for same-day range filename/period equal to the upload date', () => {
    expect(
      validatePeriodMatchesDate(
        'a.20260906_20260906.xlsx',
        { periodStart: '2026-09-06', periodEnd: '2026-09-06' },
        '2026-09-06'
      )
    ).toBeNull();
  });

  test('rejects recognizable multi-day filenames even when period fields are omitted', () => {
    // 回归：周期字段为空时旧实现直接放行，多日文件名仍能入库
    const detail = validatePeriodMatchesDate(
      'parentskudetail.20260807_20260905.xlsx',
      { periodStart: null, periodEnd: null },
      '2026-09-05'
    );
    expect(detail).toContain('多日报表');
  });

  test('rejects multi-day filenames with a faked same-day declared period', () => {
    const detail = validatePeriodMatchesDate(
      'parentskudetail.20260807_20260905.xlsx',
      { periodStart: '2026-09-05', periodEnd: '2026-09-05' },
      '2026-09-05'
    );
    expect(detail).toContain('多日报表');
  });

  test('rejects single-date filename that disagrees with the upload date', () => {
    expect(validatePeriodMatchesDate('a.20260905.xlsx', { periodStart: null, periodEnd: null }, '2026-09-06')).toContain('不一致');
  });

  test('rejects declared period that disagrees with the filename date', () => {
    expect(
      validatePeriodMatchesDate('a.20260906.xlsx', { periodStart: '2026-09-05', periodEnd: '2026-09-05' }, '2026-09-06')
    ).toContain('不一致');
  });

  test('rejects invalid or inverted filename periods', () => {
    expect(validatePeriodMatchesDate('a.20260231.xlsx', { periodStart: null, periodEnd: null }, '2026-03-03')).toContain('真实存在');
    expect(validatePeriodMatchesDate('a.20260905_20260807.xlsx', { periodStart: null, periodEnd: null }, '2026-08-07')).toContain('倒置');
  });

  test('still validates declared periods on unrecognized filenames', () => {
    expect(validatePeriodMatchesDate('a.20260905_20260905', { periodStart: '2026-08-07', periodEnd: '2026-09-05' }, '2026-09-05')).toContain('多日报表');
    expect(validatePeriodMatchesDate('no-date.xlsx', { periodStart: '2026-09-05', periodEnd: '2026-08-07' }, '2026-08-07')).toContain('倒置');
    expect(validatePeriodMatchesDate('no-date.xlsx', { periodStart: '2026-02-31', periodEnd: '2026-02-31' }, '2026-02-31')).toContain('非法');
    expect(validatePeriodMatchesDate('no-date.xlsx', { periodStart: '2026-09-05', periodEnd: '2026-09-05' }, '2026-09-06')).toContain('不一致');
    expect(validatePeriodMatchesDate('no-date.xlsx', { periodStart: '2026-09-05', periodEnd: null }, '2026-09-05')).toContain('不完整');
  });
});

describe('isSuspectedRangeFileName', () => {
  test('flags multi-day range filenames only (read-only audit marker)', () => {
    expect(isSuspectedRangeFileName('parentskudetail.20260807_20260905.xlsx')).toBe(true);
    expect(isSuspectedRangeFileName('parentskudetail-20260807-20260905.xls')).toBe(true);
    expect(isSuspectedRangeFileName('parentskudetail.20260906.xlsx')).toBe(false);
    expect(isSuspectedRangeFileName('parentskudetail.20260906_20260906.xlsx')).toBe(false); // 同日 = 单日
    expect(isSuspectedRangeFileName('a.20260231_20260905.xlsx')).toBe(false); // 日期非法不标记
    expect(isSuspectedRangeFileName('no-date.xlsx')).toBe(false);
  });
});
