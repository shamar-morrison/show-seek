/**
 * Trakt Context Helpers and Predicates
 */

import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import type { SyncStatus } from '@/src/types/trakt';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enUS, es, fr, pt, ptBR, tr } from 'date-fns/locale';
import type { User } from 'firebase/auth';

export const isActiveSyncStatus = (status?: SyncStatus['status']): boolean =>
  status === 'queued' || status === 'in_progress' || status === 'retrying';

export const isActiveEnrichmentStatus = (
  status?: 'idle' | 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed'
): boolean => status === 'queued' || status === 'in_progress' || status === 'retrying';

export const isLockedAccountStatus = (status?: SyncStatus | null): boolean =>
  status?.status === 'failed' && status.errorCategory === 'locked_account';

export const hasEligibleTraktUser = (user: User | null): user is User =>
  Boolean(user && !user.isAnonymous);

export const persistDismissedZipImportId = async (id: string | null): Promise<void> => {
  try {
    if (id === null) {
      await AsyncStorage.removeItem(TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID);
    } else {
      await AsyncStorage.setItem(TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID, id);
    }
  } catch (error) {
    console.warn('[Trakt] Failed to persist dismissed zip import id:', error);
  }
};

export const getDateFnsLocale = (lang?: string) => {
  switch (lang) {
    case 'es-ES':
    case 'es-MX':
      return es;
    case 'fr':
    case 'fr-FR':
      return fr;
    case 'pt-BR':
      return ptBR;
    case 'pt-PT':
      return pt;
    case 'tr-TR':
      return tr;
    default:
      return enUS;
  }
};
