import { mapWithConcurrency } from '../mapWithConcurrency';

test('limits active tasks and preserves input order when completions arrive out of order', async () => {
  let active = 0;
  let peak = 0;
  const completionOrder: number[] = [];
  const releases: Array<() => void> = [];
  let thirdStarted!: () => void;
  const thirdTask = new Promise<void>(resolve => { thirdStarted = resolve; });
  const pending = mapWithConcurrency(['first', 'second', 'third'], 2, async (item, index) => {
    active += 1;
    peak = Math.max(peak, active);
    const completed = new Promise<void>(resolve => { releases[index] = resolve; });
    if (index === 2) thirdStarted();
    await completed;
    active -= 1;
    completionOrder.push(index);
    return `${index}:${item}`;
  });
  releases[1]();
  await thirdTask;
  releases[2]();
  await Promise.resolve();
  releases[0]();
  const result = await pending;

  expect(peak).toBe(2);
  expect(completionOrder).toEqual([1, 2, 0]);
  expect(result).toEqual(['0:first', '1:second', '2:third']);
});

test('returns an empty result without invoking the mapper', async () => {
  const mapper = jest.fn();
  await expect(mapWithConcurrency([], 4, mapper)).resolves.toEqual([]);
  expect(mapper).not.toHaveBeenCalled();
});

test('propagates the original mapper failure', async () => {
  const failure = new Error('source lookup failed');
  await expect(mapWithConcurrency([1], 1, async () => { throw failure; })).rejects.toBe(failure);
});

test.each([0, -1, 0.5, NaN, Infinity])('rejects invalid concurrency %s', async concurrency => {
  const mapper = jest.fn();
  await expect(mapWithConcurrency([1], concurrency, mapper)).rejects.toThrow(RangeError);
  expect(mapper).not.toHaveBeenCalled();
});
