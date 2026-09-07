import { recordUsageEvent, withUsageEvent } from '../usageEvents';

describe('durable usage events', () => {
  const actor = { user: { id: 'u1', username: 'alice', role: 'owner' } } as any;

  test('one business operation and its event commit together with batch row count', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event' });
    const tx = { usageEvent: { create } } as any;
    const db = { $transaction: jest.fn(async fn => fn(tx)) } as any;
    const result = await withUsageEvent(db, actor, {
      module: 'finance', action: 'finance_import', objectType: 'FinanceRecord',
    }, async () => ({ count: 200 }));
    expect(result.count).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      actorId: 'u1', actorName: 'alice', affectedCount: 200,
      status: 'success', source: 'user', provenance: 'native',
    });
  });

  test('event persistence failure rolls back the business mutation', async () => {
    let committed = 0;
    const db = { $transaction: async (fn: any) => {
      let pending = committed;
      const result = await fn({
        product: { create: async () => { pending += 1; return { id: 'p1' }; } },
        usageEvent: { create: async () => { throw new Error('event store unavailable'); } },
      });
      committed = pending;
      return result;
    } } as any;
    await expect(withUsageEvent(db, actor, {
      module: 'product', action: 'product_create',
    }, tx => tx.product.create({ data: {} } as any))).rejects.toThrow('event store unavailable');
    expect(committed).toBe(0);
  });

  test('does not append an event when the mutation fails', async () => {
    const create = jest.fn();
    const db = { $transaction: async (fn: any) => fn({ usageEvent: { create } }) } as any;
    await expect(withUsageEvent(db, actor, { module: 'product', action: 'product_create' },
      async () => { throw new Error('business failure'); })).rejects.toThrow('business failure');
    expect(create).not.toHaveBeenCalled();
  });

  test('does not overwrite events or swallow duplicate keys', async () => {
    const create = jest.fn().mockRejectedValue({ code: 'P2002' });
    await expect(recordUsageEvent({ usageEvent: { create } } as any, {
      actorId: 'u1', eventKey: 'stable-operation-key', module: 'inventory',
      action: 'inventory_update', affectedCount: 1,
    })).rejects.toEqual({ code: 'P2002' });
    expect(create.mock.calls[0][0].data.eventKey).toBe('stable-operation-key');
  });

  test('rejects impossible affected counts and preserves system attribution', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { usageEvent: { create } } as any;
    await expect(recordUsageEvent(tx, {
      actorId: 'system', module: 'restock', action: 'restock_sync', affectedCount: -1,
    })).rejects.toThrow('affectedCount');
    await recordUsageEvent(tx, {
      actorId: 'system', module: 'restock', action: 'restock_sync', source: 'system',
    });
    expect(create.mock.calls[0][0].data.source).toBe('system');
  });
});
