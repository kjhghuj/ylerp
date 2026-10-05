import type { Request, Response } from 'express';

jest.mock('../../infrastructure/runtimeResources', () => ({
  prisma: {
    $transaction: jest.fn(async function (this: unknown, callback: (tx: unknown) => unknown) { return callback(this); }),
    usageEvent: { create: jest.fn().mockResolvedValue({}) },
    scheduleItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}));

import router from '../scheduleRoutes';
import { prisma } from '../../infrastructure/runtimeResources';

function getHandler(path: string, method: string) {
  const layers = (router as unknown as { stack: Array<any> }).stack;
  return layers.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
}

function request(body = {}, params = {}): Request {
  return { body, params, query: {}, user: { id: 'user-1', username: 'alice', role: 'member' } } as Request;
}

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => { jest.clearAllMocks(); });

it('rejects an incomplete schedule before creating a record or usage event', async () => {
  const res = response();
  await getHandler('/', 'post')(request({ type: 'routine' }), res as unknown as Response, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields: type, title' });
  expect(prisma.scheduleItem.create).not.toHaveBeenCalled();
  expect(prisma.usageEvent.create).not.toHaveBeenCalled();
});

it('checks ownership before updating a schedule', async () => {
  (prisma.scheduleItem.findFirst as jest.Mock).mockResolvedValueOnce(null);
  const res = response();
  await getHandler('/:id', 'put')(request({ completed: true }, { id: 'other-item' }), res as unknown as Response, jest.fn());
  expect(prisma.scheduleItem.findFirst).toHaveBeenCalledWith({ where: { id: 'other-item', userId: 'user-1' } });
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ error: 'Item not found' });
  expect(prisma.scheduleItem.update).not.toHaveBeenCalled();
  expect(prisma.usageEvent.create).not.toHaveBeenCalled();
});

it('preserves completion fields and the usage transaction on update', async () => {
  (prisma.scheduleItem.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'item-1' });
  (prisma.scheduleItem.update as jest.Mock).mockResolvedValueOnce({ id: 'item-1', completed: true });
  const res = response();
  await getHandler('/:id', 'put')(request({ completed: true }, { id: 'item-1' }), res as unknown as Response, jest.fn());
  expect(prisma.scheduleItem.update).toHaveBeenCalledWith({
    where: { id: 'item-1' }, data: { completed: true, completedAt: expect.any(Date) },
  });
  expect(prisma.usageEvent.create).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith({ id: 'item-1', completed: true });
});

it('keeps the public failure and logging context for a database rejection', async () => {
  const error = new Error('private connection details');
  (prisma.scheduleItem.findMany as jest.Mock).mockRejectedValueOnce(error);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = response();
  try {
    await getHandler('/', 'get')(request(), res as unknown as Response, jest.fn());
    expect(log).toHaveBeenCalledWith('Error fetching schedule items:', error);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch schedule items' });
  } finally { log.mockRestore(); }
});
