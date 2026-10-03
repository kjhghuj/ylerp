jest.mock('../../index', () => ({ prisma: { productAnalysisChatTurn: {
  findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn(),
} } }));
import { prisma } from '../../index';
import { readProductChatHistory, saveProductChatTurn, pruneProductChatHistory, startProductChatHistoryCleanup } from '../productAnalysisChatHistory';

const turns = (prisma as any).productAnalysisChatTurn;
describe('product conversation retention', () => {
  beforeEach(() => jest.resetAllMocks());
  test('reads only this account, shop and product within the rolling 30 day window', async () => {
    turns.findMany.mockResolvedValue([{ userContent: 'question', assistantContent: 'answer', createdAt: new Date('2026-10-03'), from: '2026-09-01', to: '2026-09-30' }]);
    const result = await readProductChatHistory('u1', 's1', 'p1', new Date('2026-10-03T08:00:00Z'));
    expect(turns.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      userId: 'u1', shopId: 's1', itemId: 'p1', createdAt: { gte: new Date('2026-09-03T08:00:00Z') },
    }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
    expect(result.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'question' }),
      expect.objectContaining({ role: 'assistant', content: 'answer' }),
    ]);
    expect(result.retentionDays).toBe(30);
  });
  test('duplicate request does not duplicate a saved turn', async () => {
    turns.createMany.mockResolvedValue({ count: 0 });
    await saveProductChatTurn({ userId: 'u1', shopId: 's1', itemId: 'p1', requestKey: 'r1', userContent: 'q', assistantContent: 'a', from: '2026-09-01', to: '2026-09-30' });
    expect(turns.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: expect.objectContaining({ requestKey: 'r1', userId: 'u1', assistantContent: 'a' }) }));
  });
  test('empty answers are never represented as a saved conversation', async () => {
    await expect(saveProductChatTurn({ userId: 'u1', shopId: 's1', itemId: 'p1', requestKey: 'r1', userContent: 'q', assistantContent: '', from: '2026-09-01', to: '2026-09-30' })).rejects.toThrow();
    expect(turns.createMany).not.toHaveBeenCalled();
  });
  test('deletes only expired conversation turns, including when there are no reads', async () => {
    turns.deleteMany.mockResolvedValue({ count: 2 });
    await pruneProductChatHistory(new Date('2026-10-03T08:00:00Z'));
    expect(turns.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date('2026-09-03T08:00:00Z') } } });
  });
  test('cleans at startup and hourly, then stops; a failed cleanup can recover', async () => {
    jest.useFakeTimers();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      turns.deleteMany.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ count: 0 });
      const stop = startProductChatHistoryCleanup();
      await jest.advanceTimersByTimeAsync(0);
      expect(log).toHaveBeenCalledWith('Product chat history cleanup failed');
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(turns.deleteMany).toHaveBeenCalledTimes(2);
      stop();
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(turns.deleteMany).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); jest.useRealTimers(); }
  });
});
