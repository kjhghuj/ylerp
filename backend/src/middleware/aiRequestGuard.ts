import { NextFunction, Request, Response } from 'express';
import { prisma } from '../index';

type WindowState = { timestamps: number[]; active: number };
const states = new Map<string, WindowState>();
const MINUTE = 60_000;

function positiveLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function guardAiRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isProviderCall = req.method === 'POST' && (
    req.baseUrl.endsWith('/chroma-adapt')
    || (req.baseUrl.endsWith('/product-analysis') && req.path === '/chat')
  );
  if (!isProviderCall) return next();
  const userId = req.user!.id;
  const now = Date.now();
  const state = states.get(userId) || { timestamps: [], active: 0 };
  state.timestamps = state.timestamps.filter(timestamp => now - timestamp < MINUTE);
  const perMinute = positiveLimit('AI_CALLS_PER_MINUTE', 20);
  const maxConcurrent = positiveLimit('AI_MAX_CONCURRENT_CALLS', 3);
  if (state.timestamps.length >= perMinute || state.active >= maxConcurrent) {
    res.status(429).json({ error: 'AI 调用过于频繁，请稍后再试' });
    return;
  }

  const chinaDay = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const dayStart = new Date(`${chinaDay}T00:00:00+08:00`);
  const dailyLimit = positiveLimit('AI_DAILY_CALL_LIMIT', 200);
  const usedToday = await prisma.aiUsageCall.count({
    where: { userId, provenance: 'native', startedAt: { gte: dayStart } },
  });
  if (usedToday >= dailyLimit) {
    res.status(429).json({ error: '今日 AI 调用额度已用完' });
    return;
  }

  state.timestamps.push(now);
  state.active += 1;
  states.set(userId, state);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    state.active = Math.max(0, state.active - 1);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

export function resetAiRequestGuardForTests(): void {
  states.clear();
}
