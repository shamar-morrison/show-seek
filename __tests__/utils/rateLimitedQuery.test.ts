describe('rateLimitedQuery', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    const { clearRequestQueue } = require('@/src/utils/rateLimitedQuery') as typeof import('@/src/utils/rateLimitedQuery');
    clearRequestQueue();
    jest.useRealTimers();
  });

  const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  const flushQueuedTimers = async () => {
    await jest.runAllTimersAsync();
    await flushMicrotasks();
  };

  // Verifies requests above the batch size are queued and executed later instead of being dropped.
  it('queues requests beyond the rate limit', async () => {
    const { enqueueRequest } = require('@/src/utils/rateLimitedQuery') as typeof import('@/src/utils/rateLimitedQuery');
    const callOrder: number[] = [];
    const promises = Array.from({ length: 15 }, (_, index) =>
      enqueueRequest(async () => {
        callOrder.push(index + 1);
        return index + 1;
      })
    );

    await flushMicrotasks();

    expect(callOrder).toEqual([1]);

    await flushQueuedTimers();
    await expect(Promise.all(promises)).resolves.toHaveLength(15);
    expect(callOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  // Verifies queued requests preserve FIFO order once the next rate window opens.
  it('executes queued requests in order after the batch delay', async () => {
    const { enqueueRequest } = require('@/src/utils/rateLimitedQuery') as typeof import('@/src/utils/rateLimitedQuery');
    const executionOrder: number[] = [];

    const promises = Array.from({ length: 12 }, (_, index) =>
      enqueueRequest(async () => {
        executionOrder.push(index + 1);
        return index + 1;
      })
    );

    await flushMicrotasks();
    await flushQueuedTimers();
    await Promise.all(promises);

    expect(executionOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  // Verifies large bursts eventually drain so callers are not left waiting forever.
  it('does not stall indefinitely during a burst of queued requests', async () => {
    const { enqueueRequest } = require('@/src/utils/rateLimitedQuery') as typeof import('@/src/utils/rateLimitedQuery');

    const promises = Array.from({ length: 25 }, (_, index) =>
      enqueueRequest(async () => index + 1)
    );

    await flushMicrotasks();
    await flushQueuedTimers();

    await expect(Promise.all(promises)).resolves.toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1)
    );
  });
});
