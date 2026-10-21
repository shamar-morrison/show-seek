const mockFirestore = jest.fn();
jest.mock('firebase-admin', () => ({
  firestore: mockFirestore,
  app: () => ({ options: { projectId: 'showseek-test' } }),
}), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: require('./helpers/stremioFirestore').TestTimestamp,
  FieldValue: { delete: () => require('./helpers/stremioFirestore').DELETE_FIELD },
}), { virtual: true });
jest.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'key' }) }), { virtual: true });

import { createStremioAddonToken, revokeStremioAddonToken } from '@/functions/src/stremioAddon';
import { STREMIO_STOP_RATE_LIMIT_MAX, STREMIO_STOP_RATE_LIMIT_MAX_SIZE, STREMIO_STOP_RATE_LIMIT_WINDOW_MS } from '@/functions/src/stremio/constants';
import {
  clearStremioStopRateLimit,
  clearStremioTokenCache,
  consumeStremioStopAllowance,
  hashAddonToken,
  issueAddonToken,
  lookupAddonUid,
  revokeAddonToken,
} from '@/functions/src/stremio/tokens';
import { TestFirestore, TestTimestamp } from './helpers/stremioFirestore';

const NOW = Date.UTC(2026, 9, 20, 12);
const USER = 'users/member';
const auth = { uid: 'member', token: { firebase: { sign_in_provider: 'password' } } };
let db: TestFirestore;

beforeEach(() => {
  db = new TestFirestore();
  db.seed(USER, { preferences: { autoAddToWatching: false } });
  mockFirestore.mockReturnValue(db);
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  clearStremioTokenCache();
  clearStremioStopRateLimit();
});
afterEach(() => { jest.restoreAllMocks(); });

const createToken = (request: any) => (createStremioAddonToken as any)(request);
const revokeToken = (request: any) => (revokeStremioAddonToken as any)(request);
const tokenFrom = (url: string): string => new URL(url).pathname.split('/')[2];

describe('Stremio token callables', () => {
  it.each([undefined, { uid: 'guest', token: { firebase: { sign_in_provider: 'anonymous' } } },
    { uid: 'guest', token: { sign_in_provider: 'anonymous' } }])('requires a non-anonymous account: %j', async (auth) => {
    await expect(createToken({ auth })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(revokeToken({ auth })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(db.reads).toHaveLength(0);
  });

  it('returns the full URL once and persists only a SHA-256 hash', async () => {
    const { installUrl } = await createToken({ auth });
    const token = tokenFrom(installUrl);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(installUrl).toBe(`https://us-central1-showseek-test.cloudfunctions.net/stremioAddon/${token}/manifest.json`);
    const hash = hashAddonToken(token);
    expect(db.data(`stremioAddonTokens/${hash}`)).toEqual({ uid: 'member', createdAt: TestTimestamp.fromMillis(NOW) });
    expect(db.data(USER)).toEqual({
      preferences: { autoAddToWatching: false },
      stremioAddon: { activeTokenHash: hash, nextCreateAllowedAt: TestTimestamp.fromMillis(NOW + 60_000) },
    });
    expect(JSON.stringify([...db.store])).not.toContain(token);
  });

  it('enforces a 60s issuance cooldown, then atomically rotates the token', async () => {
    const first = tokenFrom((await createToken({ auth })).installUrl);
    const firstHash = hashAddonToken(first);
    await expect(createToken({ auth })).rejects.toMatchObject({ code: 'resource-exhausted' });
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 60_000);
    const second = tokenFrom((await createToken({ auth })).installUrl);
    expect(second).not.toBe(first);
    expect(db.data(`stremioAddonTokens/${firstHash}`)?.revokedAt).toEqual(TestTimestamp.fromMillis(NOW + 60_000));
    expect(db.data(USER)?.stremioAddon.activeTokenHash).toBe(hashAddonToken(second));
    expect(await lookupAddonUid(firstHash, false)).toBeNull();
  });

  it('serializes concurrent issuance so only one token is active', async () => {
    const results = await Promise.allSettled([createToken({ auth }), createToken({ auth })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect([...db.store.keys()].filter((path) => path.startsWith('stremioAddonTokens/'))).toHaveLength(1);
  });

  it('revokes immediately during the issuance cooldown and is idempotent', async () => {
    const token = tokenFrom((await createToken({ auth })).installUrl);
    const hash = hashAddonToken(token);
    expect(await lookupAddonUid(hash)).toBe('member');
    expect(await revokeToken({ auth })).toEqual({ success: true });
    const writeCount = db.writes.length;
    expect(await revokeToken({ auth })).toEqual({ success: true });
    expect(db.writes).toHaveLength(writeCount);
    expect(db.data(USER)?.stremioAddon.activeTokenHash).toBeNull();
    expect(db.data(USER)?.stremioAddon.nextCreateAllowedAt).toEqual(TestTimestamp.fromMillis(NOW + 60_000));
    expect(await lookupAddonUid(hash)).toBeNull();
    await expect(createToken({ auth })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('does not recreate a missing account', async () => {
    db.remove(USER);
    await expect(issueAddonToken('member', 'showseek-test')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(revokeAddonToken('member')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toHaveLength(0);
  });
});

describe('hash-to-UID cache', () => {
  it('caches for 60s but manifest lookups always read fresh token state', async () => {
    const hash = 'a'.repeat(64);
    db.seed(`stremioAddonTokens/${hash}`, { uid: 'member', createdAt: TestTimestamp.now() });
    expect(await lookupAddonUid(hash)).toBe('member');
    expect(await lookupAddonUid(hash)).toBe('member');
    expect(db.reads).toHaveLength(1);
    db.seed(`stremioAddonTokens/${hash}`, { uid: 'member', revokedAt: TestTimestamp.now() });
    expect(await lookupAddonUid(hash, false)).toBeNull();
    expect(await lookupAddonUid(hash)).toBeNull();
  });

  it('expires a cached mapping at the TTL boundary', async () => {
    const hash = 'b'.repeat(64);
    db.seed(`stremioAddonTokens/${hash}`, { uid: 'member', createdAt: TestTimestamp.now() });
    await lookupAddonUid(hash);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 60_000);
    await lookupAddonUid(hash);
    expect(db.reads).toHaveLength(2);
  });

  it('bounds the cache and evicts the oldest mapping', async () => {
    for (let i = 0; i <= 1024; i++) {
      const hash = i.toString(16).padStart(64, '0');
      db.seed(`stremioAddonTokens/${hash}`, { uid: 'member' });
      await lookupAddonUid(hash);
    }
    const count = db.reads.length;
    await lookupAddonUid('0'.repeat(64));
    expect(db.reads).toHaveLength(count + 1);
  });
});

describe('per-instance qualifying-stop allowance', () => {
  const hash = 'a'.repeat(64);
  const fill = (key: string) => {
    for (let i = 0; i < STREMIO_STOP_RATE_LIMIT_MAX; i++) {
      expect(consumeStremioStopAllowance(key)).toEqual({ allowed: true, logDenial: false });
    }
  };

  it('allows 30 stops per hash and flags only the first denial in each window', () => {
    fill(hash);
    expect(consumeStremioStopAllowance(hash)).toEqual({ allowed: false, logDenial: true });
    expect(consumeStremioStopAllowance(hash)).toEqual({ allowed: false, logDenial: false });
    expect(consumeStremioStopAllowance('b'.repeat(64))).toEqual({ allowed: true, logDenial: false });
    jest.spyOn(Date, 'now').mockReturnValue(NOW + STREMIO_STOP_RATE_LIMIT_WINDOW_MS - 1);
    expect(consumeStremioStopAllowance(hash)).toEqual({ allowed: false, logDenial: false });
    jest.spyOn(Date, 'now').mockReturnValue(NOW + STREMIO_STOP_RATE_LIMIT_WINDOW_MS);
    fill(hash);
    expect(consumeStremioStopAllowance(hash)).toEqual({ allowed: false, logDenial: true });
    expect(db.reads).toHaveLength(0);
    expect(db.writes).toHaveLength(0);
  });

  it('bounds entries to 1024 and evicts the oldest without refreshing on access', () => {
    const oldest = '0'.repeat(64);
    fill(oldest);
    for (let i = 1; i < STREMIO_STOP_RATE_LIMIT_MAX_SIZE; i++) consumeStremioStopAllowance(i.toString(16).padStart(64, '0'));
    expect(consumeStremioStopAllowance(oldest).allowed).toBe(false);
    consumeStremioStopAllowance('f'.repeat(64));
    expect(consumeStremioStopAllowance(oldest).allowed).toBe(true);
  });

  it('evicts expired entries before evicting an older live entry', () => {
    const oldest = '0'.repeat(64);
    consumeStremioStopAllowance(oldest);
    for (let i = 1; i < STREMIO_STOP_RATE_LIMIT_MAX_SIZE; i++) consumeStremioStopAllowance(i.toString(16).padStart(64, '0'));
    jest.spyOn(Date, 'now').mockReturnValue(NOW + STREMIO_STOP_RATE_LIMIT_WINDOW_MS);
    fill(oldest);
    consumeStremioStopAllowance('f'.repeat(64));
    expect(consumeStremioStopAllowance(oldest).allowed).toBe(false);
  });
});
