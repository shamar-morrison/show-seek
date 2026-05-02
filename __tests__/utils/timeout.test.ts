import {
  createTimeout,
  createTimeoutWithCleanup,
  raceWithTimeout,
} from '@/src/utils/timeout';

describe('timeout utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Verifies plain timeout promises reject after the requested duration.
  it('rejects after the specified timeout duration', async () => {
    const promise = createTimeout(50, 'too slow');

    jest.advanceTimersByTime(50);

    await expect(promise).rejects.toThrow('too slow');
  });

  // Verifies racing a fast promise against a timeout resolves normally when the operation wins.
  it('resolves normally when the wrapped promise settles before the timeout', async () => {
    const fastPromise = Promise.resolve('done');

    await expect(raceWithTimeout(fastPromise, { ms: 50, message: 'too slow' })).resolves.toBe(
      'done'
    );
  });

  // Verifies cancelling the cleanup timeout prevents a later rejection after the caller already finished.
  it('prevents the cleanup timeout from firing after cancel is called', async () => {
    const { cancel, promise } = createTimeoutWithCleanup(50, 'too slow');
    const onReject = jest.fn();

    promise.catch(onReject);
    cancel();
    jest.advanceTimersByTime(50);
    await Promise.resolve();

    expect(onReject).not.toHaveBeenCalled();
  });
});
