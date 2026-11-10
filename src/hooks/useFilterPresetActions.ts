import { newFilterPresetId, useFilterPresetMutations } from '@/src/hooks/useFilterPresets';
import { trackFilterPresetApplied, trackFilterPresetSaved } from '@/src/services/analytics';
import type { DiscoverFilterState } from '@/src/utils/discoverFilters';
import type {
  DiscoverFilterPreset,
  FilterPreset,
  FilterPresetScope,
  ListFilterPreset,
} from '@/src/utils/filterPresets';
import type { WatchStatusFilterState } from '@/src/utils/listFilters';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

/**
 * What the preset UI does with presets for one scope: writes go through the optimistic
 * mutations, failures show an alert (the list has already been put back), and saves and
 * applies are counted for analytics.
 */
export function useFilterPresetActions(scope: FilterPresetScope) {
  const { t } = useTranslation();
  const { save, rename, updateFilters, remove, markUsed, userId } = useFilterPresetMutations();

  const showError = useCallback(() => {
    Alert.alert(t('common.errorTitle'), t('filterPresets.errors.saveFailed'));
  }, [t]);

  const createDiscoverPreset = useCallback(
    (name: string, mediaType: 'movie' | 'tv', filters: DiscoverFilterState) => {
      if (!userId) return;
      const preset: DiscoverFilterPreset = {
        id: newFilterPresetId(userId),
        scope: 'discover',
        name,
        mediaType,
        filters,
        createdAt: new Date(),
      };
      save.mutate(preset, {
        onSuccess: () => void trackFilterPresetSaved({ scope: 'discover' }),
        onError: showError,
      });
    },
    [save, showError, userId]
  );

  const createListPreset = useCallback(
    (name: string, filters: WatchStatusFilterState) => {
      if (!userId) return;
      const preset: ListFilterPreset = {
        id: newFilterPresetId(userId),
        scope: 'list',
        name,
        filters,
        createdAt: new Date(),
      };
      save.mutate(preset, {
        onSuccess: () => void trackFilterPresetSaved({ scope: 'list' }),
        onError: showError,
      });
    },
    [save, showError, userId]
  );

  const renamePreset = useCallback(
    (preset: FilterPreset, name: string) => {
      rename.mutate({ id: preset.id, name }, { onError: showError });
    },
    [rename, showError]
  );

  /** Replaces a preset's filters (and, for Discover, its tab) with the given preset's. */
  const replacePreset = useCallback(
    (preset: FilterPreset) => {
      updateFilters.mutate({ preset }, { onError: showError });
    },
    [showError, updateFilters]
  );

  const deletePreset = useCallback(
    (preset: FilterPreset) => {
      remove.mutate(preset, { onError: showError });
    },
    [remove, showError]
  );

  /** Counts the apply and moves the preset to the front of the list. */
  const recordApplied = useCallback(
    (preset: FilterPreset) => {
      void trackFilterPresetApplied({ scope });
      markUsed.mutate(preset);
    },
    [markUsed, scope]
  );

  return useMemo(
    () => ({
      createDiscoverPreset,
      createListPreset,
      renamePreset,
      replacePreset,
      deletePreset,
      recordApplied,
    }),
    [
      createDiscoverPreset,
      createListPreset,
      deletePreset,
      recordApplied,
      renamePreset,
      replacePreset,
    ]
  );
}
