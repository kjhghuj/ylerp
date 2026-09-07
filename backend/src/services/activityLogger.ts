import { prisma } from '../index';
import { recordUsageEvent } from './usageEvents';

/** Compatibility only. Business mutations must use withUsageEvent with their transaction. */
export async function logActivity(
  userId: string,
  action: string,
  module: string,
  metadata?: Record<string, string | number | boolean | null>,
  ip?: string
): Promise<void> {
  await recordUsageEvent(prisma, {
    actorId: userId, action, module,
    actorName: typeof metadata?.username === 'string' ? metadata.username : undefined,
    metadata: metadata || ip ? { ...metadata, ...(ip ? { ip } : {}) } : undefined,
  });
}
