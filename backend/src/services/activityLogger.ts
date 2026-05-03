import { prisma } from '../index';

export async function logActivity(
  userId: string,
  action: string,
  module: string,
  metadata?: Record<string, string | number | boolean | null>,
  ip?: string
): Promise<void> {
  try {
    await prisma.userActivity.create({
      data: {
        userId,
        action,
        module,
        metadata: metadata || undefined,
        ip: ip || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
