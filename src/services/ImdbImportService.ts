import {
  createEmptyImdbImportStats,
  mergeImdbImportStats,
  type ImdbImportChunkRequest,
  type ImdbImportChunkResult,
  type ImdbImportStats,
} from '@/functions/src/shared/imdbImport';
import { functions } from '@/src/firebase/config';
import { prepareImdbImport, type PreparedImdbImport, type RawImdbImportFile } from '@/src/utils/imdbImport';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { httpsCallable } from 'firebase/functions';

export interface ImdbImportProgress {
  completedChunks: number;
  stats: ImdbImportStats;
  totalChunks: number;
}

class ImdbImportService {
  private readonly importCallable = httpsCallable<ImdbImportChunkRequest, ImdbImportChunkResult>(
    functions,
    'importImdbChunk'
  );

  async pickRawFiles(): Promise<RawImdbImportFile[]> {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ['text/csv', 'text/plain'],
    });

    if (result.canceled) {
      return [];
    }

    return Promise.all(
      result.assets.map(async (asset) => ({
        content: await FileSystem.readAsStringAsync(asset.uri),
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
      const result = await this.importCallable(chunk);
      runtimeStats = mergeImdbImportStats(runtimeStats, result.data);

      onProgress?.({
        completedChunks: index + 1,
        stats: combineImportStats(preparedImport.stats, runtimeStats),
        totalChunks,
      });
    }

    return combineImportStats(preparedImport.stats, runtimeStats);
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
