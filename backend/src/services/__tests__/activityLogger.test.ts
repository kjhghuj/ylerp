jest.mock('../../index', () => ({
  prisma: {
    usageEvent: { create: jest.fn() },
  },
}));

import { logActivity } from '../activityLogger';
import { prisma } from '../../index';

const mockCreate = prisma.usageEvent.create as jest.Mock;

describe('logActivity', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('appends a normalized event without writing legacy activity records', async () => {
    mockCreate.mockResolvedValue({ id: '1' });

    await logActivity('user-123', 'login', 'auth', { username: 'test' }, '127.0.0.1');

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-123',
        action: 'login',
        module: 'auth',
        metadata: { username: 'test', ip: '127.0.0.1' },
      }),
    });
  });

  it('should handle missing optional parameters', async () => {
    mockCreate.mockResolvedValue({ id: '2' });

    await logActivity('user-456', 'image_generate', 'chroma');

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-456',
        action: 'image_generate',
        module: 'chroma',
        metadata: undefined,
      }),
    });
  });

  it('propagates persistence failure to the caller', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'));
    await expect(logActivity('user-1', 'login', 'auth')).rejects.toThrow('DB error');
  });
});
