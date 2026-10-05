import { NextFunction, Request, Response } from 'express';
import { positiveAiLimit } from '../services/aiCallLimits';

type WindowState = { timestamps: number[]; active: number };
const states = new Map<string, WindowState>();
const MINUTE = 60_000;
let nextSweepAt = 0;

export async function guardAiRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isProviderCall = req.method === 'POST' && (
    req.baseUrl.endsWith('/chroma-adapt')
    || (req.baseUrl.endsWith('/product-analysis') && req.path === '/chat')
  );
  if (!isProviderCall) return next();
  const userId = req.user!.id;
  const now = Date.now();
  if (now >= nextSweepAt) {
    for (const [id, window] of states) {
      if (!window.active && window.timestamps.every(timestamp => now - timestamp >= MINUTE)) states.delete(id);
    }
    nextSweepAt = now + MINUTE;
  }
  const state = states.get(userId) || { timestamps: [], active: 0 };
  state.timestamps = state.timestamps.filter(timestamp => now - timestamp < MINUTE);
  const perMinute = positiveAiLimit('AI_CALLS_PER_MINUTE', 20);
  const maxConcurrent = positiveAiLimit('AI_MAX_CONCURRENT_CALLS', 3);
  if (state.timestamps.length >= perMinute || state.active >= maxConcurrent) {
    res.status(429).json({ error: 'AI 调用过于频繁，请稍后再试' });
    return;
  }

  // Reserve synchronously; the persistent daily quota is enforced by runAiCall.
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
  nextSweepAt = 0;
}
