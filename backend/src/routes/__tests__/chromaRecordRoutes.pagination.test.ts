jest.mock('../../infrastructure/runtimeResources', () => ({
  prisma: {
    aiUsageCall: { findMany: jest.fn(), count: jest.fn() },
    chromaImage: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import type { Request, Response } from 'express';
import { prisma } from '../../infrastructure/runtimeResources';
import router from '../chromaRecordRoutes';

function handler(path: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('gallery pagination validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['/records', '/images'])('rejects unsafe page on %s before querying storage', async path => {
    const req = { user: { id: 'user-1' }, query: { page: '99999999999999999999999999' } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    await handler(path)(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.aiUsageCall.findMany).not.toHaveBeenCalled();
    expect(prisma.chromaImage.findMany).not.toHaveBeenCalled();
  });
});
