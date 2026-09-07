jest.mock('../../index', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../index';
import { authenticate, authorizeAnyPermission } from '../authMiddleware';
import { getJwtSecret } from '../../services/jwtSecret';

const findUser = prisma.user.findUnique as jest.Mock;

function response() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

describe('authentication freshness and permissions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reloads active account state and current permissions for every token', async () => {
    const token = jwt.sign({ id: 'u1', username: 'stale', role: 'viewer' }, getJwtSecret());
    findUser.mockResolvedValue({ id: 'u1', username: 'current', role: 'admin', permissions: ['chroma-adapt.edit'], isActive: true });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const { res } = response();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'u1', username: 'current', role: 'admin', permissions: ['chroma-adapt.edit'] });
  });

  it('rejects a disabled account even when its token has not expired', async () => {
    const token = jwt.sign({ id: 'u1' }, getJwtSecret());
    findUser.mockResolvedValue({ id: 'u1', username: 'u1', role: 'viewer', permissions: [], isActive: false });
    const { res, status } = response();
    await authenticate({ headers: { authorization: `Bearer ${token}` } } as Request, res, jest.fn());
    expect(status).toHaveBeenCalledWith(401);
  });

  it('enforces exact or module-level Chroma permission while owners pass', () => {
    const middleware = authorizeAnyPermission('chroma-adapt.generate');
    const denied = response();
    middleware({ user: { id: 'u1', username: 'u1', role: 'viewer', permissions: ['chroma-adapt.edit'] } } as Request, denied.res, jest.fn() as NextFunction);
    expect(denied.status).toHaveBeenCalledWith(403);

    for (const user of [
      { id: 'u2', username: 'u2', role: 'viewer', permissions: ['chroma-adapt.generate'] },
      { id: 'u3', username: 'u3', role: 'admin', permissions: ['chroma-adapt'] },
      { id: 'u4', username: 'u4', role: 'owner', permissions: [] },
    ]) {
      const next = jest.fn();
      middleware({ user } as Request, response().res, next);
      expect(next).toHaveBeenCalled();
    }
  });
});
