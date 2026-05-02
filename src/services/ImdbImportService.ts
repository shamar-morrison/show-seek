import {
  createEmptyImdbImportStats,
  mergeImdbImportStats,
  type ImdbImportChunkRequest,
  type ImdbImportChunkResult,
  type ImdbImportStats,
} from '@/functions/src/shared/imdbImport';
import { functions } from '@/src/firebase/config';
import { prepareImdbImport, type PreparedImdbImport, type RawImdbImportFile } from '@/src/utils/imdbImport';
import { httpsCallable } from 'firebase/functions';

export interface ImdbImportProgress {
  completedChunks: number;
  stats: ImdbImportStats;
  totalChunks: number;
}

type DocumentPickerModule = typeof import('expo-document-picker');
type FileSystemModule = typeof import('expo-file-system/legacy');

class ImdbImportService {
  private readonly importCallable = httpsCallable<ImdbImportChunkRequest, ImdbImportChunkResult>(
    functions,
    'importImdbChunk'
  );
  private documentPickerModulePromise: Promise<DocumentPickerModule> | null = null;
  private fileSystemModulePromise: Promise<FileSystemModule> | null = null;

  async pickRawFiles(): Promise<RawImdbImportFile[]> {
    const documentPicker = await this.getDocumentPickerModule();
    const result = await documentPicker.getDocumentAsync({
      base64: false,
      copyToCacheDirectory: true,
      multiple: true,
      type: ['text/csv', 'text/plain'],
    });

    if (result.canceled) {
      return [];
    }

    const fileSystem = await this.getFileSystemModule();

    return Promise.all(
      result.assets.map(async (asset) => ({
        content: await fileSystem.readAsStringAsync(asset.uri),
        fileName: asset.name || 'imdb-import.csv',
      }))
    );
  }

  prepareFiles(files: RawImdbImportFile[]): PreparedImdbImport {
    return prepareImdbImport(files);
  }

  async runPreparedImport(
    preparedImport: PreparedImdbImport,
    onProgress?: (progress: ImdbImportProgress) => void
  ): Promise<ImdbImportStats> {
    let runtimeStats = createEmptyImdbImportStats();
    const totalChunks = preparedImport.chunks.length;

    onProgress?.({
      completedChunks: 0,
      stats: combineImportStats(preparedImport.stats, runtimeStats),
      totalChunks,
    });

    for (let index = 0; index < preparedImport.chunks.length; index += 1) {
      const chunk = preparedImport.chunks[index];
      try {
        const result = await this.importCallable(chunk);
        runtimeStats = mergeImdbImportStats(runtimeStats, result.data);
      } catch (error) {
        console.error('[ImdbImportService] Failed to import chunk:', {
          chunkIndex: index,
          error,
        });
      }

      onProgress?.({
        completedChunks: index + 1,
        stats: combineImportStats(preparedImport.stats, runtimeStats),
        totalChunks,
      });
    }

    return combineImportStats(preparedImport.stats, runtimeStats);
  }

  private getDocumentPickerModule(): Promise<DocumentPickerModule> {
    if (!this.documentPickerModulePromise) {
      this.documentPickerModulePromise = shouldUseRequireForLazyImports()
        ? Promise.resolve(require('expo-document-picker') as DocumentPickerModule)
        : import('expo-document-picker');
    }

    return this.documentPickerModulePromise;
  }

  private getFileSystemModule(): Promise<FileSystemModule> {
    if (!this.fileSystemModulePromise) {
      this.fileSystemModulePromise = shouldUseRequireForLazyImports()
        ? Promise.resolve(require('expo-file-system/legacy') as FileSystemModule)
        : import('expo-file-system/legacy');
    }

    return this.fileSystemModulePromise;
  }
}

export const imdbImportService = new ImdbImportService();

function combineImportStats(
  preparedStats: ImdbImportStats,
  runtimeStats: ImdbImportStats
): ImdbImportStats {
  const merged = mergeImdbImportStats(preparedStats, runtimeStats);

  return {
    ...merged,
    processedActions: preparedStats.processedActions,
    processedEntities: preparedStats.processedEntities,
  };
}

function shouldUseRequireForLazyImports(): boolean {
  return typeof process !== 'undefined' && typeof process.env.JEST_WORKER_ID === 'string';
}
