jest.mock('../../index', () => ({
  prisma: {
    userActivity: { create: jest.fn() },
  },
}));

import { logActivity } from '../activityLogger';
import { prisma } from '../../index';

const mockCreate = prisma.userActivity.create as jest.Mock;

describe('logActivity', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('should call prisma.userActivity.create with correct data', async () => {
    mockCreate.mockResolvedValue({ id: '1' });

    await logActivity('user-123', 'login', 'auth', { username: 'test' }, '127.0.0.1');

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-123',
        action: 'login',
        module: 'auth',
        metadata: { username: 'test' },
        ip: '127.0.0.1',
      },
    });
  });

  it('should handle missing optional parameters', async () => {
    mockCreate.mockResolvedValue({ id: '2' });

    await logActivity('user-456', 'image_generate', 'chroma');

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-456',
        action: 'image_generate',
        module: 'chroma',
        metadata: undefined,
        ip: undefined,
      },
    });
  });

  it('should not throw when prisma fails', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(logActivity('user-1', 'login', 'auth')).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith('Failed to log activity:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
