import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { filterPresetService } from '@/src/services/FilterPresetService';
import {
  partitionListPresets,
  sortPresets,
  type DiscoverFilterPreset,
  type FilterPreset,
  type ListFilterPreset,
  type ListPresetScreenCaps,
} from '@/src/utils/filterPresets';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

export const getFilterPresetsQueryKey = (userId: string | undefined) =>
  ['filterPresets', userId] as const;

const EMPTY: FilterPreset[] = [];

function useSignedInUserId(): string | undefined {
  const { user } = useAuth();
  return user && !user.isAnonymous ? user.uid : undefined;
}

/**
 * Every saved filter preset for the signed-in user, newest first. One cached read is shared by
 * Discover and all list screens; guests get an empty list.
 */
export function useFilterPresets() {
  const queryClient = useQueryClient();
  const userId = useSignedInUserId();
  const previousUserIdRef = useRef(userId);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== userId) {
      queryClient.removeQueries({ queryKey: getFilterPresetsQueryKey(previousUserId) });
    }
    previousUserIdRef.current = userId;
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: getFilterPresetsQueryKey(userId),
    queryFn: () => filterPresetService.getUserPresets(userId!),
    enabled: !!userId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
    select: sortPresets,
  });

  return { ...query, data: query.data ?? EMPTY };
}

export function useDiscoverPresets(): DiscoverFilterPreset[] {
  const { data } = useFilterPresets();
  return useMemo(
    () => data.filter((preset): preset is DiscoverFilterPreset => preset.scope === 'discover'),
    [data]
  );
}

/** List presets, split into the ones this screen can apply and how many it can't. */
export function useListPresets(caps: ListPresetScreenCaps) {
  const { data } = useFilterPresets();
  const { mediaType, showListFilters } = caps;
  return useMemo(() => {
    const all = data.filter((preset): preset is ListFilterPreset => preset.scope === 'list');
    return { all, ...partitionListPresets(all, { mediaType, showListFilters }) };
  }, [data, mediaType, showListFilters]);
}

// --- Mutations -------------------------------------------------------------------------------

type PresetsUpdater = (presets: FilterPreset[]) => FilterPreset[];

type OptimisticContext = { previous: FilterPreset[] | undefined };

/**
 * Applies a change to the cached presets straight away and returns what to restore if the
 * write fails. With nothing cached yet, the cache is left alone: writing a partial list would
 * pass for the full one until the next refetch. `settle` loads the real list instead.
 */
async function applyOptimistic(
  queryClient: QueryClient,
  userId: string,
  update: PresetsUpdater
): Promise<OptimisticContext> {
  const key = getFilterPresetsQueryKey(userId);
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<FilterPreset[]>(key);
  if (previous) {
    queryClient.setQueryData<FilterPreset[]>(key, update(previous));
  }
  return { previous };
}

function rollback(
  queryClient: QueryClient,
  userId: string | undefined,
  context: OptimisticContext | undefined
) {
  if (!userId || !context?.previous) return;
  queryClient.setQueryData(getFilterPresetsQueryKey(userId), context.previous);
}

/** Loads the saved list once a write settles, when there was no cached list to update. */
function settle(
  queryClient: QueryClient,
  userId: string | undefined,
  context: OptimisticContext | undefined
) {
  if (!userId || !context || context.previous) return;
  void queryClient.invalidateQueries({ queryKey: getFilterPresetsQueryKey(userId) });
}

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new Error('Please sign in to continue');
  return userId;
}

/**
 * Saving, renaming, updating and deleting presets. The list updates at once and goes back to
 * how it was if a write fails. Validation (names, duplicates, the cap) happens before calling.
 */
export function useFilterPresetMutations() {
  const queryClient = useQueryClient();
  const userId = useSignedInUserId();

  /** Saves a new preset. */
  const save = useMutation({
    mutationFn: (preset: FilterPreset) =>
      filterPresetService.savePreset(requireUserId(userId), preset),
    onMutate: (preset) =>
      applyOptimistic(queryClient, requireUserId(userId), (presets) => [
        preset,
        ...presets.filter((existing) => existing.id !== preset.id),
      ]),
    onError: (_error, _preset, context) => rollback(queryClient, userId, context),
    onSettled: (_data, _error, _vars, context) => settle(queryClient, userId, context),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      filterPresetService.renamePreset(requireUserId(userId), id, name),
    onMutate: ({ id, name }) =>
      applyOptimistic(queryClient, requireUserId(userId), (presets) =>
        presets.map((preset) => (preset.id === id ? { ...preset, name } : preset))
      ),
    onError: (_error, _vars, context) => rollback(queryClient, userId, context),
    onSettled: (_data, _error, _vars, context) => settle(queryClient, userId, context),
  });

  const updateFilters = useMutation({
    mutationFn: ({ preset }: { preset: FilterPreset }) =>
      filterPresetService.updatePresetFilters(requireUserId(userId), preset),
    onMutate: ({ preset }) =>
      applyOptimistic(queryClient, requireUserId(userId), (presets) =>
        presets.map((existing) => (existing.id === preset.id ? preset : existing))
      ),
    onError: (_error, _vars, context) => rollback(queryClient, userId, context),
    onSettled: (_data, _error, _vars, context) => settle(queryClient, userId, context),
  });

  const remove = useMutation({
    mutationFn: (preset: FilterPreset) =>
      filterPresetService.deletePreset(requireUserId(userId), preset.id),
    onMutate: (preset) =>
      applyOptimistic(queryClient, requireUserId(userId), (presets) =>
        presets.filter((existing) => existing.id !== preset.id)
      ),
    onError: (_error, _preset, context) => rollback(queryClient, userId, context),
    onSettled: (_data, _error, _vars, context) => settle(queryClient, userId, context),
  });

  // Not worth an alert if this fails; the order just stays as it was.
  const markUsed = useMutation({
    mutationFn: (preset: FilterPreset) =>
      filterPresetService.markPresetUsed(requireUserId(userId), preset.id),
    onMutate: (preset) =>
      applyOptimistic(queryClient, requireUserId(userId), (presets) =>
        presets.map((existing) =>
          existing.id === preset.id ? { ...existing, lastUsedAt: new Date() } : existing
        )
      ),
    onError: (_error, _preset, context) => rollback(queryClient, userId, context),
    onSettled: (_data, _error, _vars, context) => settle(queryClient, userId, context),
  });

  return { save, rename, updateFilters, remove, markUsed, userId };
}

export function newFilterPresetId(userId: string): string {
  return filterPresetService.newPresetId(userId);
}
