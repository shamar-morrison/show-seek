import { db, functions, storage } from '@/src/firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable } from 'firebase/storage';

export type TraktZipImportPhase =
  | 'pending'
  | 'downloading'
  | 'parsing'
  | 'syncing'
  | 'completed'
  | 'failed';

export type TraktZipImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TraktZipImportStats {
  customLists: number;
  episodes: number;
  favorites: number;
  movies: number;
  movieWatches: number;
  ratings: number;
  shows: number;
  watchlist: number;
}

export interface TraktZipImportProgressDoc {
  completedAt?: { seconds: number; nanoseconds: number } | number | Date;
  createdAt?: { seconds: number; nanoseconds: number } | number | Date;
  error?: string;
  failedAt?: { seconds: number; nanoseconds: number } | number | Date;
  id: string;
  progress: {
    current: number;
    phase: TraktZipImportPhase;
    total: number;
  };
  stats: TraktZipImportStats;
  status: TraktZipImportStatus;
  updatedAt?: { seconds: number; nanoseconds: number } | number | Date;
  userId: string;
}

export interface SelectedZipFile {
  name: string;
  size?: number;
  uri: string;
}

export class TraktZipUploadError extends Error {
  constructor(message: string, readonly originalError?: unknown) {
    super(message);
    this.name = 'TraktZipUploadError';
  }
}

export class TraktZipImportError extends Error {
  constructor(message: string, readonly originalError?: unknown) {
    super(message);
    this.name = 'TraktZipImportError';
  }
}

type DocumentPickerModule = typeof import('expo-document-picker');

export const generateImportId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `zip_${timestamp}_${randomPart}`;
};

export const createEmptyTraktZipStats = (): TraktZipImportStats => ({
  customLists: 0,
  episodes: 0,
  favorites: 0,
  movies: 0,
  movieWatches: 0,
  ratings: 0,
  shows: 0,
  watchlist: 0,
});

export class TraktZipImportService {
  private documentPickerModulePromise: Promise<DocumentPickerModule> | null = null;
  private readonly startImportCallable = httpsCallable<
    { importId: string },
    { importId: string }
  >(functions, 'startTraktZipImport');

  constructor(
    private readonly documentPickerLoader: () => Promise<DocumentPickerModule> = () =>
      import('expo-document-picker')
  ) {}

  setDocumentPickerModuleForTest(module: DocumentPickerModule | null): void {
    this.documentPickerModulePromise = module ? Promise.resolve(module) : null;
  }

  async pickZipFile(): Promise<SelectedZipFile | null> {
    const documentPicker = await this.getDocumentPickerModule();
    const result = await documentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const fileName = asset.name || 'trakt-export.zip';

    if (!fileName.toLowerCase().endsWith('.zip')) {
      throw new TraktZipImportError('Selected file is not a .zip archive. Please select a valid Trakt export zip file.');
    }

    return {
      name: fileName,
      size: asset.size,
      uri: asset.uri,
    };
  }

  async uploadZipFile(
    userId: string,
    importId: string,
    fileUri: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const storagePath = `users/${userId}/imports/${importId}.zip`;
      const storageRef = ref(storage, storagePath);

      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: 'application/zip',
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress =
              snapshot.totalBytes > 0
                ? snapshot.bytesTransferred / snapshot.totalBytes
                : 0;
            onProgress?.(progress);
          },
          (error) => {
            reject(
              new TraktZipUploadError(
                `Upload failed: ${error.message || 'Network error while uploading archive.'}`,
                error
              )
            );
          },
          () => {
            onProgress?.(1);
            resolve();
          }
        );
      });

      return storagePath;
    } catch (error) {
      if (error instanceof TraktZipUploadError) {
        throw error;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Could not read or upload the selected file.';
      throw new TraktZipUploadError(message, error);
    }
  }

  async startImport(importId: string): Promise<{ importId: string }> {
    try {
      const result = await this.startImportCallable({ importId });
      return result.data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to initiate background import processing.';
      throw new TraktZipImportError(message, error);
    }
  }

  subscribeToProgress(
    userId: string,
    importId: string,
    onUpdate: (data: TraktZipImportProgressDoc) => void,
    onError?: (error: Error) => void
  ): () => void {
    const docRef = doc(db, 'users', userId, 'trakt_imports', importId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const rawData = snapshot.data() as Partial<TraktZipImportProgressDoc>;
        const progressDoc: TraktZipImportProgressDoc = {
          completedAt: rawData.completedAt,
          createdAt: rawData.createdAt,
          error: rawData.error,
          failedAt: rawData.failedAt,
          id: rawData.id || importId,
          progress: rawData.progress || {
            current: 0,
            phase: 'pending',
            total: 100,
          },
          stats: rawData.stats || createEmptyTraktZipStats(),
          status: rawData.status || 'pending',
          updatedAt: rawData.updatedAt,
          userId: rawData.userId || userId,
        };

        onUpdate(progressDoc);
      },
      (error) => {
        console.error('[TraktZipImportService] Subscription error:', error);
        onError?.(error);
      }
    );

    return unsubscribe;
  }

  private getDocumentPickerModule(): Promise<DocumentPickerModule> {
    if (!this.documentPickerModulePromise) {
      this.documentPickerModulePromise = this.documentPickerLoader();
    }

    return this.documentPickerModulePromise;
  }
}

export const traktZipImportService = new TraktZipImportService();
