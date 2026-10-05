export function positiveAiLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function aiCallDayStart(now = Date.now()): Date {
  const chinaDay = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  return new Date(`${chinaDay}T00:00:00+08:00`);
}
