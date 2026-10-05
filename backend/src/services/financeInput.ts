import { isValidCalendarDate } from '../utils/calendarDate';

export class FinanceInputError extends Error {}

export interface FinanceInput {
  date: Date;
  type: string;
  amount: number;
  category: string;
  description: string;
  accountId: string;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FinanceInputError('Expected a finance record object');
  }
  return value as Record<string, unknown>;
}

function financeDate(value: unknown): Date {
  if (typeof value !== 'string' || !isValidCalendarDate(value.slice(0, 10)) ||
      !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new FinanceInputError('Invalid finance date');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new FinanceInputError('Invalid finance date');
  return date;
}

/** Explicit business fields keep IDs, relations and server audit fields out of Prisma writes. */
export function parseFinanceInput(value: unknown): FinanceInput;
export function parseFinanceInput(value: unknown, partial: true): Partial<FinanceInput>;
export function parseFinanceInput(value: unknown, partial = false): Partial<FinanceInput> {
  const body = record(value);
  const result: Partial<FinanceInput> = {};
  if (!partial || body.date !== undefined) result.date = financeDate(body.date);
  if (!partial || body.amount !== undefined) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
      throw new FinanceInputError('Invalid finance amount');
    }
    result.amount = body.amount;
  }
  for (const field of ['type', 'category', 'description', 'accountId'] as const) {
    if (partial && body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || (field !== 'description' && !body[field].trim())) {
      throw new FinanceInputError(`Invalid finance ${field}`);
    }
    result[field] = body[field];
  }
  return result;
}

export function parseFinanceMonth(value: unknown): { startDate: Date; endDate: Date } {
  if (typeof value !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) {
    throw new FinanceInputError('Invalid month format, expected YYYY-MM');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5));
  if (year < 1) throw new FinanceInputError('Invalid month format, expected YYYY-MM');
  // Keep the existing local-time boundaries, including December -> January rollover.
  const boundary = (monthIndex: number) => {
    const date = new Date(0);
    date.setFullYear(year, monthIndex, 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  return { startDate: boundary(month - 1), endDate: boundary(month) };
}
