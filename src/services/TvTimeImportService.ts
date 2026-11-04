import {
  mergeTvTimeImportStats,
  type TvTimeImportChunkRequest,
  type TvTimeImportChunkResult,
  type TvTimeImportLimitDoc,
  type TvTimeImportStats,
  type TvTimeRateLimitDetails,
} from '@/functions/src/shared/tvtimeImport';
import { db, functions } from '@/src/firebase/config';
import type { PickedTvTimeFile } from '@/src/utils/tvtimeImport/files';
import { prepareTvTimeImport, type PreparedTvTimeImport } from '@/src/utils/tvtimeImport/prepare';
import { getTvTimeErrorCode } from '@/src/utils/tvtimeImportError';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

type DocumentPickerModule = typeof import('expo-document-picker');
type FileSystemModule = typeof import('expo-file-system/legacy');
type KeepAwakeModule = typeof import('expo-keep-awake');

export interface TvTimeImportProgress {
  completedChunks: number;
  totalChunks: number;
  stats: TvTimeImportStats;
}

export interface TvTimeImportRunResult {
  stats: TvTimeImportStats;
  /** Chunks that still failed after retries; offered via "Retry failed items". */
  failedChunkIndexes: number[];
}

/** Thrown when the server refuses the run as a whole (cooldown, another import active, …). */
export class TvTimeImportRunError extends Error {
  constructor(
    readonly code: string,
    readonly details: Partial<TvTimeRateLimitDetails> | null
  ) {
    super(`TV Time import stopped: ${code}`);
    this.name = 'TvTimeImportRunError';
  }
}

interface StoredRun {
  importId: string;
  fingerprint: string;
  completed: number[];
  startedAt: number;
}

const CALLABLE_TIMEOUT_MS = 300_000; // matches the function's timeoutSeconds
const MAX_TRANSIENT_ATTEMPTS = 3;
const TRANSIENT_BACKOFF_MS = [2_000, 5_000];
const MAX_BURST_WAITS = 5;
const MAX_BURST_WAIT_MS = 60_000;
const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'internal']);
const KEEP_AWAKE_TAG = 'tvtime-import';

const storageKey = (userId: string) => `tvtimeImport:activeRun:${userId}`;

class TvTimeImportService {
  private readonly importCallable = httpsCallable<
    TvTimeImportChunkRequest,
    TvTimeImportChunkResult
  >(functions, 'importTvTimeChunk', { timeout: CALLABLE_TIMEOUT_MS });
  private documentPickerModulePromise: Promise<DocumentPickerModule> | null = null;
  private fileSystemModulePromise: Promise<FileSystemModule> | null = null;
  private keepAwakeModulePromise: Promise<KeepAwakeModule> | null = null;

  /** Lets the user pick a ZIP, or one or more loose CSV/JSON files. */
  async pickFiles(): Promise<PickedTvTimeFile[]> {
    const documentPicker = await this.load('documentPicker');
    const result = await documentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      // Export MIME types vary by platform and tool; the parser decides what's usable.
      type: '*/*',
    });
    if (result.canceled) {
      return [];
    }

    const fileSystem = await this.load('fileSystem');
    return Promise.all(
      result.assets.map(async (asset) => ({
        bytes: decodeBase64(
          await fileSystem.readAsStringAsync(asset.uri, {
            encoding: fileSystem.EncodingType.Base64,
          })
        ),
        name: asset.name || 'tvtime-export',
      }))
    );
  }

  prepare(files: PickedTvTimeFile[]): PreparedTvTimeImport {
    return prepareTvTimeImport(files);
  }

  /** Server-side limit state, for showing the cooldown before the user picks a file. */
  async getLimitState(
    userId: string
  ): Promise<{ nextAllowedImportAt: number | null; activeImportId: string | null }> {
    const snapshot = await getDoc(doc(db, 'users', userId, 'import_limits', 'tvtime'));
    const data = snapshot.data() as Partial<TvTimeImportLimitDoc> | undefined;
    return {
      activeImportId: data?.session?.id ?? null,
      nextAllowedImportAt: data?.session?.nextAllowedImportAt ?? null,
    };
  }

  /** The unfinished run on this device, if any. Its importId is reused so resuming never hits the cooldown. */
  async getStoredRun(userId: string): Promise<StoredRun | null> {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      return raw ? (JSON.parse(raw) as StoredRun) : null;
    } catch {
      return null;
    }
  }

  async clearStoredRun(userId: string): Promise<void> {
    await AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
  }

  /**
   * Sends chunks one at a time. Transient failures are retried with backoff; burst
   * limits wait for `retryAfterMs`; run-level refusals (cooldown, another import
   * active, premium) stop the run with a `TvTimeImportRunError`.
   */
  async runPreparedImport(
    prepared: PreparedTvTimeImport,
    userId: string,
    onProgress?: (progress: TvTimeImportProgress) => void,
    onlyChunkIndexes?: number[]
  ): Promise<TvTimeImportRunResult> {
    const fingerprint = fingerprintOf(prepared);
    const stored = await this.getStoredRun(userId);
    const run: StoredRun = {
      completed: stored?.fingerprint === fingerprint ? stored.completed : [],
      fingerprint,
      // Reuse the unfinished run's id even for a different file: the server treats a
      // new id inside the cooldown as a new import and refuses it.
      importId: stored?.importId ?? createImportId(),
      startedAt: stored?.startedAt ?? Date.now(),
    };
    await this.saveRun(userId, run);

    const indexes = onlyChunkIndexes ?? prepared.chunks.map((_, index) => index);
    const pending = indexes.filter((index) => !run.completed.includes(index));
    const alreadyDone = indexes.length - pending.length;
    let stats = prepared.stats;
    let doneThisRun = 0;
    const failedChunkIndexes: number[] = [];
    const report = () =>
      onProgress?.({
        completedChunks: alreadyDone + doneThisRun,
        stats,
        totalChunks: indexes.length,
      });

    const keepAwake = await this.load('keepAwake').catch(() => null);
    await keepAwake?.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    report();

    try {
      for (const index of pending) {
        const result = await this.sendChunk({ importId: run.importId, ...prepared.chunks[index] });
        if (result) {
          stats = mergeTvTimeImportStats(stats, result);
          run.completed.push(index);
          await this.saveRun(userId, run);
        } else {
          failedChunkIndexes.push(index);
        }
        doneThisRun += 1;
        report();
      }
    } finally {
      keepAwake?.deactivateKeepAwake(KEEP_AWAKE_TAG);
    }

    if (failedChunkIndexes.length === 0 && run.completed.length >= prepared.chunks.length) {
      await this.clearStoredRun(userId);
    }
    return { failedChunkIndexes, stats };
  }

  /** Returns the chunk's stats, null after exhausting transient retries, or throws a run-level refusal. */
  private async sendChunk(
    request: TvTimeImportChunkRequest
  ): Promise<TvTimeImportChunkResult | null> {
    let transientAttempts = 0;
    let burstWaits = 0;

    for (;;) {
      try {
        return (await this.importCallable(request)).data;
      } catch (error) {
        const code = getTvTimeErrorCode(error);
        const details = (error as { details?: Partial<TvTimeRateLimitDetails> }).details ?? null;

        if (
          code === 'resource-exhausted' &&
          details?.reason === 'burst' &&
          burstWaits < MAX_BURST_WAITS
        ) {
          burstWaits += 1;
          await wait(Math.min(details.retryAfterMs ?? 5_000, MAX_BURST_WAIT_MS));
          continue;
        }
        if (code && TRANSIENT_CODES.has(code)) {
          transientAttempts += 1;
          if (transientAttempts >= MAX_TRANSIENT_ATTEMPTS) {
            console.error('[TvTimeImportService] Chunk failed after retries:', error);
            return null;
          }
          await wait(TRANSIENT_BACKOFF_MS[transientAttempts - 1] ?? 5_000);
          continue;
        }
        throw new TvTimeImportRunError(code ?? 'unknown', details);
      }
    }
  }

  private async saveRun(userId: string, run: StoredRun): Promise<void> {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(run)).catch(() => undefined);
  }

  private load(name: 'documentPicker'): Promise<DocumentPickerModule>;
  private load(name: 'fileSystem'): Promise<FileSystemModule>;
  private load(name: 'keepAwake'): Promise<KeepAwakeModule>;
  private load(name: 'documentPicker' | 'fileSystem' | 'keepAwake'): Promise<unknown> {
    const isJest = typeof process !== 'undefined' && typeof process.env.JEST_WORKER_ID === 'string';
    switch (name) {
      case 'documentPicker':
        this.documentPickerModulePromise ??= isJest
          ? Promise.resolve(require('expo-document-picker') as DocumentPickerModule)
          : import('expo-document-picker');
        return this.documentPickerModulePromise;
      case 'fileSystem':
        this.fileSystemModulePromise ??= isJest
          ? Promise.resolve(require('expo-file-system/legacy') as FileSystemModule)
          : import('expo-file-system/legacy');
        return this.fileSystemModulePromise;
      case 'keepAwake':
        this.keepAwakeModulePromise ??= isJest
          ? Promise.resolve(require('expo-keep-awake') as KeepAwakeModule)
          : import('expo-keep-awake');
        return this.keepAwakeModulePromise;
    }
  }
}

export const tvTimeImportService = new TvTimeImportService();

/** Identifies "the same export" so a resumed run can skip chunks it already sent. */
export function fingerprintOf(prepared: PreparedTvTimeImport): string {
  const { summary } = prepared;
  return [
    prepared.format,
    prepared.chunks.length,
    summary.shows,
    summary.episodes,
    summary.movies,
    summary.movieWatches,
    summary.lists,
  ].join(':');
}

function createImportId(): string {
  const random = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `tvtime-${Date.now().toString(36)}-${random}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) table[BASE64_ALPHABET.charCodeAt(i)] = i;
  table['-'.charCodeAt(0)] = 62; // tolerate URL-safe variants
  table['_'.charCodeAt(0)] = 63;
  return table;
})();

/** Base64 → bytes without atob/Buffer (works on Hermes for multi-MB exports). */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/\-_]/g, '');
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_LOOKUP[clean.charCodeAt(i)];
    const b = BASE64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = BASE64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = BASE64_LOOKUP[clean.charCodeAt(i + 3)];
    output[outIndex++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) output[outIndex++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) output[outIndex++] = ((c & 3) << 6) | d;
  }
  return output.subarray(0, outIndex);
}
