import { createRequestPool, RequestAbortedError } from '@/src/utils/requestPool';

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

describe('createRequestPool', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never runs more than maxConcurrent requests at once and refills as soon as one finishes', async () => {
    const pool = createRequestPool({ maxConcurrent: 2, maxPerSecond: 100 });
    const resolvers: (() => void)[] = [];
    let started = 0;

    const tasks = Array.from({ length: 4 }, () =>
      pool.enqueue(
        () =>
          new Promise<void>((resolve) => {
            started += 1;
            resolvers.push(resolve);
          })
      )
    );

    await flushMicrotasks();
    expect(started).toBe(2);

    resolvers[0]();
    await flushMicrotasks();
    expect(started).toBe(3);

    resolvers.slice(1).forEach((resolve) => resolve());
    await flushMicrotasks();
    resolvers.forEach((resolve) => resolve());
    await Promise.all(tasks);
    expect(started).toBe(4);
  });

  it('caps requests started within one second', async () => {
    const pool = createRequestPool({ maxConcurrent: 100, maxPerSecond: 3 });
    const run = jest.fn(() => Promise.resolve('ok'));

    const tasks = Array.from({ length: 5 }, () => pool.enqueue(run));
    await flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(3);

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(5);
    await expect(Promise.all(tasks)).resolves.toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('drops queued requests whose signal aborts without running them', async () => {
    const pool = createRequestPool({ maxConcurrent: 1, maxPerSecond: 100 });
    const controller = new AbortController();
    let releaseFirst: () => void = () => {};
    const first = pool.enqueue(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('first');
        })
    );
    const queuedRun = jest.fn(() => Promise.resolve('queued'));
    const queued = pool.enqueue(queuedRun, controller.signal);

    await flushMicrotasks();
    controller.abort();

    await expect(queued).rejects.toBeInstanceOf(RequestAbortedError);
    releaseFirst();
    await expect(first).resolves.toBe('first');
    await flushMicrotasks();
    expect(queuedRun).not.toHaveBeenCalled();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const pool = createRequestPool({ maxConcurrent: 1, maxPerSecond: 1 });
    const controller = new AbortController();
    controller.abort();
    const run = jest.fn(() => Promise.resolve());

    await expect(pool.enqueue(run, controller.signal)).rejects.toBeInstanceOf(RequestAbortedError);
    expect(run).not.toHaveBeenCalled();
  });

  it('holds new requests while paused', async () => {
    const pool = createRequestPool({ maxConcurrent: 5, maxPerSecond: 100 });
    const run = jest.fn(() => Promise.resolve());

    pool.pause(2000);
    const task = pool.enqueue(run);
    await flushMicrotasks();
    expect(run).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2000);
    await flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(1);
    await task;
  });

  it('propagates request errors and keeps processing the queue', async () => {
    const pool = createRequestPool({ maxConcurrent: 1, maxPerSecond: 100 });
    const failing = pool.enqueue(() => Promise.reject(new Error('boom')));
    const next = pool.enqueue(() => Promise.resolve('next'));

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('next');
  });
});
