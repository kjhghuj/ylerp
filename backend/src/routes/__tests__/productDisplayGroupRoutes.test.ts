import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: { count: jest.fn() },
    productDisplayGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    productDisplayGroupMember: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import router from '../productDisplayGroupRoutes';
import { prisma } from '../../index';

const db = prisma as any;

const getHandler = (path: string, method: string) => {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = (): Partial<Response> => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
});

const getMiddleware = (path: string, method: string) => {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
};

describe('product display group routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(db));
  });

  it('allows read-only product viewers to list groups but blocks group writes', () => {
    const req = {
      user: { id: 'user-1', role: 'viewer', permissions: ['product-list.view'] },
    } as unknown as Request;
    const readRes = createResponse();
    const writeRes = createResponse();
    const nextRead = jest.fn();
    const nextWrite = jest.fn();

    getMiddleware('/', 'get')(req, readRes as Response, nextRead);
    getMiddleware('/', 'post')(req, writeRes as Response, nextWrite);

    expect(nextRead).toHaveBeenCalledTimes(1);
    expect(writeRes.status).toHaveBeenCalledWith(403);
    expect(nextWrite).not.toHaveBeenCalled();
  });

  it('allows product editors to create groups', () => {
    const req = {
      user: { id: 'user-1', role: 'viewer', permissions: ['product-list.edit'] },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    getMiddleware('/', 'post')(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('lists only groups owned by the current user', async () => {
    const groups = [{ id: 'group-1', name: 'Bottle', members: [{ productId: 'p1' }] }];
    db.productDisplayGroup.findMany.mockResolvedValue(groups);
    const req = { user: { id: 'user-1' } } as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'get')(req as Request, res as Response, jest.fn());

    expect(db.productDisplayGroup.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { members: { select: { productId: true, createdAt: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    expect(res.json).toHaveBeenCalledWith(groups);
  });

  it('creates a group and its members atomically', async () => {
    db.product.count.mockResolvedValue(2);
    db.productDisplayGroup.create.mockResolvedValue({ id: 'group-1', name: 'Bottle' });
    db.productDisplayGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      name: 'Bottle',
      members: [{ productId: 'p1' }, { productId: 'p2' }],
    });
    const req = {
      user: { id: 'user-1' },
      body: { name: ' Bottle ', productIds: ['p1', 'p2', 'p1'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(db.product.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['p1', 'p2'] } },
    });
    expect(db.productDisplayGroup.create).toHaveBeenCalledWith({
      data: { name: 'Bottle', userId: 'user-1' },
    });
    expect(db.productDisplayGroupMember.createMany).toHaveBeenCalledWith({
      data: [
        { groupId: 'group-1', productId: 'p1' },
        { groupId: 'group-1', productId: 'p2' },
      ],
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects a new group with fewer than two distinct products', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { name: 'Bottle', productIds: ['p1', 'p1'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects products that do not all belong to the current user', async () => {
    db.product.count.mockResolvedValue(1);
    const req = {
      user: { id: 'user-1' },
      body: { name: 'Bottle', productIds: ['p1', 'foreign-product'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.productDisplayGroup.create).not.toHaveBeenCalled();
  });

  it('returns a conflict when a product already belongs to another group', async () => {
    db.product.count.mockResolvedValue(2);
    db.productDisplayGroup.create.mockResolvedValue({ id: 'group-1', name: 'Bottle' });
    db.productDisplayGroupMember.createMany.mockRejectedValue({ code: 'P2002' });
    const req = {
      user: { id: 'user-1' },
      body: { name: 'Bottle', productIds: ['p1', 'p2'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('does not mutate a group owned by another user', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue(null);
    const req = {
      user: { id: 'user-1' },
      params: { id: 'foreign-group' },
      body: { name: 'Renamed' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.productDisplayGroup.update).not.toHaveBeenCalled();
  });

  it('renames an owned group', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue({ id: 'group-1', userId: 'user-1' });
    db.productDisplayGroup.update.mockResolvedValue({ id: 'group-1', name: 'Renamed', members: [] });
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
      body: { name: ' Renamed ' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());

    expect(db.productDisplayGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { name: 'Renamed' },
      include: { members: { select: { productId: true, createdAt: true } } },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
  });

  it('adds owned products to an owned group atomically', async () => {
    db.productDisplayGroup.findFirst
      .mockResolvedValueOnce({ id: 'group-1', userId: 'user-1' })
      .mockResolvedValueOnce({ id: 'group-1', members: [{ productId: 'p3' }] });
    db.product.count.mockResolvedValue(1);
    db.productDisplayGroupMember.createMany.mockResolvedValue({ count: 1 });
    db.productDisplayGroup.update.mockResolvedValue({ id: 'group-1' });
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
      body: { productIds: ['p3'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id/members', 'post')(req as Request, res as Response, jest.fn());

    expect(db.productDisplayGroupMember.createMany).toHaveBeenCalledWith({
      data: [{ groupId: 'group-1', productId: 'p3' }],
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'group-1' }));
  });

  it('rejects adding members to a missing group', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue(null);
    const req = {
      user: { id: 'user-1' },
      params: { id: 'missing-group' },
      body: { productIds: ['p3'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id/members', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.productDisplayGroupMember.createMany).not.toHaveBeenCalled();
  });

  it('rejects adding a product owned by another user', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue({ id: 'group-1', userId: 'user-1' });
    db.product.count.mockResolvedValue(0);
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
      body: { productIds: ['foreign-product'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id/members', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.productDisplayGroupMember.createMany).not.toHaveBeenCalled();
  });

  it('returns a conflict when an added member is already grouped', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue({ id: 'group-1', userId: 'user-1' });
    db.product.count.mockResolvedValue(1);
    db.productDisplayGroupMember.createMany.mockRejectedValue({ code: 'P2002' });
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
      body: { productIds: ['p3'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id/members', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('removes a member without deleting the product', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    db.productDisplayGroupMember.deleteMany.mockResolvedValue({ count: 1 });
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1', productId: 'p1' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id/members/:productId', 'delete')(req as Request, res as Response, jest.fn());

    expect(db.productDisplayGroupMember.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', productId: 'p1' },
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('returns not found when a member is absent', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    db.productDisplayGroupMember.deleteMany.mockResolvedValue({ count: 0 });
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1', productId: 'missing-product' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id/members/:productId', 'delete')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.productDisplayGroup.update).not.toHaveBeenCalled();
  });

  it('disbands an owned group without deleting products directly', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue({ id: 'group-1', userId: 'user-1' });
    db.productDisplayGroup.delete.mockResolvedValue({ id: 'group-1' });
    const req = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id', 'delete')(req as Request, res as Response, jest.fn());

    expect(db.productDisplayGroup.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
    expect(db.product).not.toHaveProperty('delete');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('does not disband a group owned by another user', async () => {
    db.productDisplayGroup.findFirst.mockResolvedValue(null);
    const req = {
      user: { id: 'user-1' },
      params: { id: 'foreign-group' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id', 'delete')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.productDisplayGroup.delete).not.toHaveBeenCalled();
  });

  it('returns validation errors before database writes', async () => {
    const renameReq = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
      body: { name: '   ' },
    } as unknown as Partial<Request>;
    const membersReq = {
      user: { id: 'user-1' },
      params: { id: 'group-1' },
      body: { productIds: [] },
    } as unknown as Partial<Request>;
    const renameRes = createResponse();
    const membersRes = createResponse();

    await getHandler('/:id', 'put')(renameReq as Request, renameRes as Response, jest.fn());
    await getHandler('/:id/members', 'post')(membersReq as Request, membersRes as Response, jest.fn());

    expect(renameRes.status).toHaveBeenCalledWith(400);
    expect(membersRes.status).toHaveBeenCalledWith(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('maps unexpected database failures to a server error', async () => {
    db.productDisplayGroup.findMany.mockRejectedValue(new Error('database unavailable'));
    const req = { user: { id: 'user-1' } } as Partial<Request>;
    const res = createResponse();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await getHandler('/', 'get')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('maps an unexpected create transaction failure to a server error', async () => {
    db.$transaction.mockRejectedValue(new Error('write failed'));
    const req = {
      user: { id: 'user-1' },
      body: { name: 'Bottle', productIds: ['p1', 'p2'] },
    } as unknown as Partial<Request>;
    const res = createResponse();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('reports an unapplied group migration clearly', async () => {
    db.$transaction.mockRejectedValue({ code: 'P2021' });
    const req = {
      user: { id: 'user-1' },
      body: { name: 'Bottle', productIds: ['p1', 'p2'] },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: '商品分组数据表尚未初始化，请联系管理员执行数据库迁移',
      code: 'GROUP_SCHEMA_NOT_READY',
    });
  });
});
