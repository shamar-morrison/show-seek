import {
  mergeFileImportStats,
  type FileImportChunkRequest,
  type FileImportChunkResult,
  type FileImportLimitDoc,
  type FileImportRateLimitDetails,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { db, functions } from '@/src/firebase/config';
import {
  SIMKL_MAX_EXPORT_BYTES,
  SimklImportError,
  type PickedSimklFile,
} from '@/src/utils/simklImport/files';
import { prepareSimklImport, type PreparedSimklImport } from '@/src/utils/simklImport/prepare';
import { getSimklErrorCode } from '@/src/utils/simklImportError';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

/**
 * Runs a Simkl import: one chunk at a time to `importSimklChunk`, with the same retry,
 * resume and keep-awake behaviour as the TV Time import (see TvTimeImportService, which
 * this mirrors; the two are kept separate so TV Time's code is never touched by Simkl work).
 */

type DocumentPickerModule = typeof import('expo-document-picker');
type FileSystemModule = typeof import('expo-file-system/legacy');
type KeepAwakeModule = typeof import('expo-keep-awake');

export interface SimklImportProgress {
  completedChunks: number;
  totalChunks: number;
  stats: FileImportStats;
}

export interface SimklImportRunResult {
  stats: FileImportStats;
  /** Chunks that still failed after retries; offered via "Retry failed items". */
  failedChunkIndexes: number[];
}

/** Thrown when the server refuses the run as a whole (cooldown, another import active, …). */
export class SimklImportRunError extends Error {
  constructor(
    readonly code: string,
    readonly details: Partial<FileImportRateLimitDetails> | null
  ) {
    super(`Simkl import stopped: ${code}`);
    this.name = 'SimklImportRunError';
  }
}

interface StoredRun {
  importId: string;
  fingerprint: string;
  completed: number[];
  startedAt: number;
  /** Stats from every completed chunk, so a resumed run's summary covers the whole import. */
  stats?: FileImportStats;
}

const CALLABLE_TIMEOUT_MS = 300_000; // matches the function's timeoutSeconds
const MAX_TRANSIENT_ATTEMPTS = 3;
const TRANSIENT_BACKOFF_MS = [2_000, 5_000];
const MAX_BURST_WAITS = 5;
const MAX_BURST_WAIT_MS = 60_000;
const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'internal']);
const KEEP_AWAKE_TAG = 'simkl-import';

const storageKey = (userId: string) => `simklImport:activeRun:${userId}`;

class SimklImportService {
  private readonly importCallable = httpsCallable<FileImportChunkRequest, FileImportChunkResult>(
    functions,
    'importSimklChunk',
    { timeout: CALLABLE_TIMEOUT_MS }
  );
  private documentPickerModulePromise: Promise<DocumentPickerModule> | null = null;
  private fileSystemModulePromise: Promise<FileSystemModule> | null = null;
  private keepAwakeModulePromise: Promise<KeepAwakeModule> | null = null;

  /** Lets the user pick Simkl's backup ZIP (or the JSON inside it). */
  async pickFiles(): Promise<PickedSimklFile[]> {
    const documentPicker = await this.load('documentPicker');
    const result = await documentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      // Simkl serves its ZIP as text/json, and phones label it inconsistently; the
      // parser identifies the file by its content.
      type: '*/*',
    });
    if (result.canceled) {
      return [];
    }

    // Refuse oversized picks before loading them into memory as base64.
    const declaredBytes = result.assets.reduce((total, asset) => total + (asset.size ?? 0), 0);
    if (declaredBytes > SIMKL_MAX_EXPORT_BYTES) {
      throw new SimklImportError('too_large');
    }

    const fileSystem = await this.load('fileSystem');
    return Promise.all(
      result.assets.map(async (asset) => {
        let base64: string;
        try {
          base64 = await fileSystem.readAsStringAsync(asset.uri, {
            encoding: fileSystem.EncodingType.Base64,
          });
        } catch (error) {
          console.error('[SimklImportService] Could not read picked file:', error);
          throw new SimklImportError('unreadable_file');
        }
        return { bytes: decodeBase64(base64), name: asset.name || 'SimklBackup.zip' };
      })
    );
  }

  prepare(files: PickedSimklFile[]): PreparedSimklImport {
    return prepareSimklImport(files);
  }

  /** Server-side limit state, for showing the cooldown before the user picks a file. */
  async getLimitState(
    userId: string
  ): Promise<{ nextAllowedImportAt: number | null; activeImportId: string | null }> {
    const snapshot = await getDoc(doc(db, 'users', userId, 'import_limits', 'simkl'));
    const data = snapshot.data() as Partial<FileImportLimitDoc> | undefined;
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
   * active, premium) stop the run with a `SimklImportRunError`.
   */
  async runPreparedImport(
    prepared: PreparedSimklImport,
    userId: string,
    onProgress?: (progress: SimklImportProgress) => void,
    onlyChunkIndexes?: number[]
  ): Promise<SimklImportRunResult> {
    const fingerprint = fingerprintOf(prepared);
    const stored = await this.getStoredRun(userId);
    const isSameExport = stored?.fingerprint === fingerprint;
    const run: StoredRun = {
      completed: isSameExport ? stored.completed : [],
      fingerprint,
      // Reuse the unfinished run's id even for a different file: the server treats a
      // new id inside the cooldown as a new import and refuses it.
      importId: stored?.importId ?? createImportId(),
      startedAt: stored?.startedAt ?? Date.now(),
      stats: (isSameExport ? stored.stats : undefined) ?? prepared.stats,
    };
    await this.saveRun(userId, run);

    const indexes = onlyChunkIndexes ?? prepared.chunks.map((_, index) => index);
    const pending = indexes.filter((index) => !run.completed.includes(index));
    const alreadyDone = indexes.length - pending.length;
    // Retrying failed chunks: the caller already holds the earlier stats and merges them.
    // Resuming after a restart: start from what the earlier chunks reported.
    let stats = onlyChunkIndexes ? prepared.stats : run.stats!;
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
      for (const [position, index] of pending.entries()) {
        const result = await this.sendChunk({
          importId: run.importId,
          ...prepared.chunks[index],
          // Lets the server mark the import finished, so a new one isn't refused as "already running".
          ...(position === pending.length - 1 ? { final: true } : {}),
        });
        if (result) {
          stats = mergeFileImportStats(stats, result);
          run.stats = mergeFileImportStats(run.stats!, result);
          run.completed.push(index);
          await this.saveRun(userId, run);
        } else {
          failedChunkIndexes.push(index);
        }
        doneThisRun += 1;
        report();
      }
    } catch (error) {
      // A run the server refused before accepting anything has nothing to resume.
      if (error instanceof SimklImportRunError && run.completed.length === 0) {
        await this.clearStoredRun(userId);
      }
      throw error;
    } finally {
      keepAwake?.deactivateKeepAwake(KEEP_AWAKE_TAG);
    }

    if (failedChunkIndexes.length === 0 && run.completed.length >= prepared.chunks.length) {
      await this.clearStoredRun(userId);
    }
    return { failedChunkIndexes, stats };
  }

  /** Returns the chunk's stats, null after exhausting transient retries, or throws a run-level refusal. */
  private async sendChunk(request: FileImportChunkRequest): Promise<FileImportChunkResult | null> {
    let transientAttempts = 0;
    let burstWaits = 0;

    for (;;) {
      try {
        return (await this.importCallable(request)).data;
      } catch (error) {
        const code = getSimklErrorCode(error);
        const details =
          (error as { details?: Partial<FileImportRateLimitDetails> }).details ?? null;

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
            console.error('[SimklImportService] Chunk failed after retries:', error);
            return null;
          }
          await wait(TRANSIENT_BACKOFF_MS[transientAttempts - 1] ?? 5_000);
          continue;
        }
        throw new SimklImportRunError(code ?? 'unknown', details);
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

export const simklImportService = new SimklImportService();

/** Identifies "the same export" so a resumed run can skip chunks it already sent. */
export function fingerprintOf(prepared: PreparedSimklImport): string {
  const { summary } = prepared;
  return [
    prepared.format,
    prepared.chunks.length,
    summary.shows,
    summary.episodes,
    summary.movies,
    summary.movieWatches,
    // Two exports can share every count; the content hash tells them apart.
    hashString(JSON.stringify(prepared.chunks)),
  ].join(':');
}

/** 32-bit FNV-1a, hex. Not cryptographic: it only has to tell two exports apart. */
function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createImportId(): string {
  const random = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `simkl-${Date.now().toString(36)}-${random}`;
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

/** Base64 → bytes without atob/Buffer (works on Hermes for multi-MB files). */
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
