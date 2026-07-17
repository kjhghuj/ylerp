import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    profitTemplate: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn(() => Promise.resolve()),
}));

import router from '../templateRoutes';
import { prisma } from '../../index';

const mockTemplate = prisma.profitTemplate as unknown as {
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

const validGraphData = require('../../../../test-fixtures/profit-graph-executable.json');

function getHandler(path: string, method: string) {
  const stack = (router as unknown as { stack: Array<any> }).stack;
  const layer = stack.find(item => item.route?.path === path && item.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('shared template data routes', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: {},
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
      body: {
        name: 'Graph',
        country: 'MYR',
        data: validGraphData,
      },
    } as Partial<Request>;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('accepts a valid graph and preserves unknown fields on create', async () => {
    mockTemplate.create.mockResolvedValueOnce({ id: 'template-1', data: validGraphData });

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(mockTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ data: validGraphData }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('continues to accept legacy standard data', async () => {
    req.body = {
      name: 'Legacy',
      country: 'MYR',
      data: { platformCommissionRate: 6 },
    };
    mockTemplate.create.mockResolvedValueOnce({ id: 'template-legacy' });

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(mockTemplate.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects explicit invalid compatibility data for a shared template', async () => {
    req.body = {
      name: 'Invalid',
      country: 'MYR',
      data: {
        kind: 'invalid',
        schemaVersion: 99,
        compatibilityEnvelope: true,
        rawData: { future: true },
      },
    };

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(mockTemplate.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('kind') });
  });

  it.each([
    ['unknown kind', { kind: 'future', schemaVersion: 2, future: true }],
    ['future standard version', { kind: 'standard', schemaVersion: 3, platformCommissionRate: 6 }],
    ['partial graph disguised as standard', {
      kind: 'standard',
      schemaVersion: 2,
      graphTemplateId: 'partial',
      platformCommissionRate: 6,
    }],
  ])('rejects %s on shared template create', async (_label, data) => {
    req.body = {
      name: 'Rejected',
      country: 'MYR',
      data,
    };

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(mockTemplate.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a malformed graph update', async () => {
    req.params = { id: 'template-1' };
    req.body = {
      data: {
        ...validGraphData,
        graphTemplateSnapshot: {
          ...validGraphData.graphTemplateSnapshot,
          id: 'mismatch',
        },
      },
    };
    mockTemplate.findFirst.mockResolvedValueOnce({ id: 'template-1', userId: 'owner-1' });

    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());

    expect(mockTemplate.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('graphTemplateSnapshot.id'),
    });
  });

  it('accepts a valid graph update and preserves unknown fields', async () => {
    req.params = { id: 'template-1' };
    req.body = { data: validGraphData };
    mockTemplate.findFirst.mockResolvedValueOnce({ id: 'template-1', userId: 'owner-1' });
    mockTemplate.update.mockResolvedValueOnce({ id: 'template-1', data: validGraphData });

    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());

    expect(mockTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { data: validGraphData },
    });
    expect(res.json).toHaveBeenCalledWith({ id: 'template-1', data: validGraphData });
  });
});
