import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface UsageEventInput {
  actorId: string;
  actorName?: string | null;
  module: string;
  action: string;
  eventKey?: string;
  source?: 'user' | 'system';
  status?: 'success' | 'failed';
  objectType?: string;
  objectId?: string;
  affectedCount?: number;
  metadata?: Prisma.InputJsonObject;
}

/** Append only. Call with the same transaction client as the business mutation. */
export async function recordUsageEvent(
  tx: Pick<Prisma.TransactionClient, 'usageEvent'>,
  event: UsageEventInput,
): Promise<void> {
  const affectedCount = event.affectedCount ?? 1;
  if (!Number.isSafeInteger(affectedCount) || affectedCount < 0) {
    throw new Error('Invalid usage event affectedCount');
  }
  await tx.usageEvent.create({ data: {
    ...event,
    eventKey: event.eventKey ?? randomUUID(),
    source: event.source ?? 'user',
    status: event.status ?? 'success',
    affectedCount,
    provenance: 'native',
  } });
}

type OperationEvent<T> = Omit<UsageEventInput, 'actorId' | 'actorName' | 'affectedCount' | 'objectId'> & {
  affectedCount?: number | ((result: T) => number);
  objectId?: string | ((result: T) => string | undefined);
};

/** Explicit business boundary, never an HTTP response hook. Fail closed on event loss. */
export async function withUsageEvent<T>(
  db: Pick<PrismaClient, '$transaction'>,
  req: Pick<Request, 'user'>,
  event: OperationEvent<T>,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number },
): Promise<T> {
  if (!req.user) throw new Error('Usage event actor is required');
  const eventKey = event.eventKey ?? randomUUID();
  return db.$transaction(async tx => {
    const result = await operation(tx);
    const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    const objectId = typeof event.objectId === 'function'
      ? event.objectId(result) : event.objectId ?? (typeof record.id === 'string' ? record.id : undefined);
    const affectedCount = typeof event.affectedCount === 'function'
      ? event.affectedCount(result) : event.affectedCount ?? (typeof record.count === 'number' ? record.count : 1);
    await recordUsageEvent(tx, {
      ...event, eventKey, objectId, affectedCount,
      actorId: req.user!.id,
      actorName: req.user!.username,
    });
    return result;
  }, options);
}
