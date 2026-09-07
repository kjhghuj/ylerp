jest.mock('../../index', () => ({ prisma: {
  user: { findUnique: jest.fn() }, usageEvent: { create: jest.fn() },
} }));
jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'test-token') }));
jest.mock('../../middleware/authMiddleware', () => ({ authenticate: (_req: any, _res: any, next: any) => next() }));

import bcrypt from 'bcrypt';
import router from '../authRoutes';
import { prisma } from '../../index';

const handler = (path: string, method: string) => (router as any).stack.find((entry: any) =>
  entry.route?.path === path && entry.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

describe('password login usage events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', username: 'alice',
      displayName: 'Alice', role: 'owner', isActive: true, password: 'hash' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (prisma.usageEvent.create as jest.Mock).mockResolvedValue({});
  });
  test('records one successful login and never trusts forwarded headers directly', async () => {
    const res = response();
    await handler('/login', 'post')({ body: { username: 'alice', password: 'secret' },
      ip: '127.0.0.1', headers: { 'x-forwarded-for': 'attacker-controlled' }, socket: {} }, res);
    expect(prisma.usageEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.usageEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: 'u1', actorName: 'Alice', action: 'login', module: 'auth', metadata: { ip: '127.0.0.1' },
    }) });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'test-token' }));
  });
  test('does not claim login success if durable recording fails', async () => {
    (prisma.usageEvent.create as jest.Mock).mockRejectedValueOnce(new Error('event write failed'));
    const log = jest.spyOn(console, 'error').mockImplementation();
    const res = response();
    await handler('/login', 'post')({ body: { username: 'alice', password: 'secret' }, ip: '127.0.0.1', socket: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ token: expect.anything() }));
    log.mockRestore();
  });
  test('wrong password and existing session restoration produce no login event', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await handler('/login', 'post')({ body: { username: 'alice', password: 'wrong' } }, response());
    await handler('/me', 'get')({ user: { id: 'u1' } }, response());
    await handler('/me', 'get')({ user: { id: 'dev-admin-id' } }, response());
    expect(prisma.usageEvent.create).not.toHaveBeenCalled();
  });
});
