import { auditedGetDocs } from '@/src/services/firestoreReadAudit';
import {
  getSignedInUser,
  requireMatchingUser,
  rethrowFirestoreError,
} from '@/src/services/serviceSupport';
import {
  normalizeDiscoverPresetFilters,
  normalizeListPresetFilters,
  type FilterPreset,
} from '@/src/utils/filterPresets';
import { raceWithTimeout } from '@/src/utils/timeout';
import { collection, deleteDoc, doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const toDate = (value: unknown): Date =>
  (value as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);

/** The stored form of a preset, or null when the document isn't a usable preset. */
export function mapDocToFilterPreset(
  id: string,
  data: Record<string, unknown>
): FilterPreset | null {
  const name = typeof data.name === 'string' ? data.name : '';
  if (!name) return null;
  const createdAt = toDate(data.createdAt);
  const lastUsedAt = data.lastUsedAt ? toDate(data.lastUsedAt) : null;

  if (data.scope === 'discover') {
    if (data.mediaType !== 'movie' && data.mediaType !== 'tv') return null;
    return {
      id,
      scope: 'discover',
      name,
      mediaType: data.mediaType,
      filters: normalizeDiscoverPresetFilters(data.filters),
      createdAt,
      lastUsedAt,
    };
  }
  if (data.scope === 'list') {
    return {
      id,
      scope: 'list',
      name,
      filters: normalizeListPresetFilters(data.filters),
      createdAt,
      lastUsedAt,
    };
  }
  return null;
}

class FilterPresetService {
  private getCollection(userId: string) {
    return collection(db, 'users', userId, 'filterPresets');
  }

  /** A new document ID, made on the device so the screen can show the preset before it's saved. */
  newPresetId(userId: string): string {
    return doc(this.getCollection(userId)).id;
  }

  async getUserPresets(userId: string): Promise<FilterPreset[]> {
    try {
      const user = getSignedInUser();
      if (!user || user.uid !== userId) return [];

      const snapshot = await raceWithTimeout(
        auditedGetDocs(this.getCollection(userId), {
          path: `users/${userId}/filterPresets`,
          queryKey: 'filterPresets',
          callsite: 'FilterPresetService.getUserPresets',
        })
      );

      return snapshot.docs
        .map((presetDoc) => mapDocToFilterPreset(presetDoc.id, presetDoc.data()))
        .filter((preset): preset is FilterPreset => preset !== null);
    } catch (error) {
      return rethrowFirestoreError('FilterPresetService.getUserPresets', error);
    }
  }

  /** Saves a new preset under the ID it was given on the device. */
  async savePreset(userId: string, preset: FilterPreset): Promise<void> {
    try {
      requireMatchingUser(userId);
      const now = Timestamp.now();
      await raceWithTimeout(
        setDoc(doc(this.getCollection(userId), preset.id), {
          scope: preset.scope,
          name: preset.name,
          ...(preset.scope === 'discover' && { mediaType: preset.mediaType }),
          filters: preset.filters,
          createdAt: Timestamp.fromDate(preset.createdAt),
          updatedAt: now,
        })
      );
    } catch (error) {
      return rethrowFirestoreError('FilterPresetService.savePreset', error);
    }
  }

  async renamePreset(userId: string, presetId: string, name: string): Promise<void> {
    try {
      requireMatchingUser(userId);
      await raceWithTimeout(
        updateDoc(doc(this.getCollection(userId), presetId), {
          name,
          updatedAt: Timestamp.now(),
        })
      );
    } catch (error) {
      return rethrowFirestoreError('FilterPresetService.renamePreset', error);
    }
  }

  /** Replaces a preset's filters, and for Discover its tab, keeping its name and date. */
  async updatePresetFilters(userId: string, preset: FilterPreset): Promise<void> {
    try {
      requireMatchingUser(userId);
      await raceWithTimeout(
        updateDoc(doc(this.getCollection(userId), preset.id), {
          filters: preset.filters,
          ...(preset.scope === 'discover' && { mediaType: preset.mediaType }),
          updatedAt: Timestamp.now(),
        })
      );
    } catch (error) {
      return rethrowFirestoreError('FilterPresetService.updatePresetFilters', error);
    }
  }

  /** Records that a preset was applied, so it moves to the front of the list. */
  async markPresetUsed(userId: string, presetId: string): Promise<void> {
    try {
      requireMatchingUser(userId);
      await raceWithTimeout(
        updateDoc(doc(this.getCollection(userId), presetId), {
          lastUsedAt: Timestamp.now(),
        })
      );
    } catch (error) {
      return rethrowFirestoreError('FilterPresetService.markPresetUsed', error);
    }
  }

  async deletePreset(userId: string, presetId: string): Promise<void> {
    try {
      requireMatchingUser(userId);
      await raceWithTimeout(deleteDoc(doc(this.getCollection(userId), presetId)));
    } catch (error) {
      return rethrowFirestoreError('FilterPresetService.deletePreset', error);
    }
  }
}

export const filterPresetService = new FilterPresetService();
