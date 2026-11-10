import { DEFAULT_DISCOVER_FILTERS } from '@/src/utils/discoverFilters';
import type { FilterPreset, ListFilterPreset } from '@/src/utils/filterPresets';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetUserPresets = jest.fn();
const mockSavePreset = jest.fn();
const mockRenamePreset = jest.fn();
const mockUpdatePresetFilters = jest.fn();
const mockDeletePreset = jest.fn();
const mockMarkPresetUsed = jest.fn();

const mockAuthState: { user: { uid: string; isAnonymous?: boolean } | null } = {
  user: { uid: 'user-1' },
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/services/FilterPresetService', () => ({
  filterPresetService: {
    getUserPresets: (...args: unknown[]) => mockGetUserPresets(...args),
    savePreset: (...args: unknown[]) => mockSavePreset(...args),
    renamePreset: (...args: unknown[]) => mockRenamePreset(...args),
    updatePresetFilters: (...args: unknown[]) => mockUpdatePresetFilters(...args),
    deletePreset: (...args: unknown[]) => mockDeletePreset(...args),
    markPresetUsed: (...args: unknown[]) => mockMarkPresetUsed(...args),
    newPresetId: () => 'new-id',
  },
}));

import {
  useDiscoverPresets,
  useFilterPresetMutations,
  useFilterPresets,
  useListPresets,
} from '@/src/hooks/useFilterPresets';

const listPreset = (id: string, overrides: Partial<ListFilterPreset> = {}): ListFilterPreset => ({
  id,
  scope: 'list',
  name: id,
  filters: { ...DEFAULT_WATCH_STATUS_FILTERS, rating: 7 },
  createdAt: new Date(2026, 0, 1),
  ...overrides,
});

const discoverPreset: FilterPreset = {
  id: 'd1',
  scope: 'discover',
  name: 'Horror',
  mediaType: 'movie',
  filters: { ...DEFAULT_DISCOVER_FILTERS, genres: [27] },
  createdAt: new Date(2026, 1, 1),
};

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const usePresetsAndMutations = () => ({
  presets: useFilterPresets().data,
  mutations: useFilterPresetMutations(),
});

describe('useFilterPresets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'user-1' };
  });

  it('loads presets newest first and splits them by scope', async () => {
    const older = listPreset('older', {
      createdAt: new Date(2025, 0, 1),
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, runtime: 'under30' },
    });
    mockGetUserPresets.mockResolvedValue([older, discoverPreset, listPreset('l1')]);
    const client = createClient();

    const { result } = renderHook(
      () => ({
        all: useFilterPresets().data,
        discover: useDiscoverPresets(),
        list: useListPresets({ mediaType: 'movie', showListFilters: false }),
      }),
      { wrapper: wrapperFor(client) }
    );

    await waitFor(() => expect(result.current.all).toHaveLength(3));
    expect(result.current.all.map((p) => p.id)).toEqual(['d1', 'l1', 'older']);
    expect(result.current.discover.map((p) => p.id)).toEqual(['d1']);
    expect(result.current.list.all.map((p) => p.id)).toEqual(['l1', 'older']);
    expect(result.current.list.compatible.map((p) => p.id)).toEqual(['l1']);
    expect(result.current.list.hiddenCount).toBe(1);
    expect(mockGetUserPresets).toHaveBeenCalledWith('user-1');
  });

  it('does not read for guests', () => {
    mockAuthState.user = { uid: 'guest', isAnonymous: true };
    const { result } = renderHook(() => useFilterPresets(), {
      wrapper: wrapperFor(createClient()),
    });
    expect(result.current.data).toEqual([]);
    expect(mockGetUserPresets).not.toHaveBeenCalled();
  });

  it('shows a saved preset at once', async () => {
    mockGetUserPresets.mockResolvedValue([listPreset('l1')]);
    let resolveSave!: () => void;
    mockSavePreset.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
    const { result } = renderHook(usePresetsAndMutations, {
      wrapper: wrapperFor(createClient()),
    });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    const created = listPreset('l2', { createdAt: new Date(2026, 5, 1) });
    act(() => {
      result.current.mutations.save.mutate(created);
    });

    await waitFor(() => expect(result.current.presets.map((p) => p.id)).toEqual(['l2', 'l1']));
    expect(mockSavePreset).toHaveBeenCalledWith('user-1', created);
    await act(async () => resolveSave());
  });

  it('puts the list back when a delete fails', async () => {
    const preset = listPreset('l1');
    mockGetUserPresets.mockResolvedValue([preset]);
    mockDeletePreset.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(usePresetsAndMutations, {
      wrapper: wrapperFor(createClient()),
    });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    await act(async () => {
      await result.current.mutations.remove.mutateAsync(preset).catch(() => {});
    });

    expect(mockDeletePreset).toHaveBeenCalledWith('user-1', 'l1');
    await waitFor(() => expect(result.current.presets.map((p) => p.id)).toEqual(['l1']));
  });

  it('renames and replaces filters in place', async () => {
    const preset = listPreset('l1');
    mockGetUserPresets.mockResolvedValue([preset]);
    mockRenamePreset.mockResolvedValue(undefined);
    mockUpdatePresetFilters.mockResolvedValue(undefined);
    const { result } = renderHook(usePresetsAndMutations, {
      wrapper: wrapperFor(createClient()),
    });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    await act(async () => {
      await result.current.mutations.rename.mutateAsync({ id: 'l1', name: 'Renamed' });
    });
    await waitFor(() => expect(result.current.presets[0].name).toBe('Renamed'));

    const replaced = {
      ...result.current.presets[0],
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, year: 2001 },
    } as ListFilterPreset;
    await act(async () => {
      await result.current.mutations.updateFilters.mutateAsync({ preset: replaced });
    });
    await waitFor(() => expect(result.current.presets[0].filters.year).toBe(2001));
    expect(mockUpdatePresetFilters).toHaveBeenCalledWith('user-1', replaced);
  });

  it('moves a preset to the front once it is used', async () => {
    const older = listPreset('older', { createdAt: new Date(2025, 0, 1) });
    const newer = listPreset('newer', {
      createdAt: new Date(2026, 0, 1),
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, year: 1999 },
    });
    mockGetUserPresets.mockResolvedValue([older, newer]);
    mockMarkPresetUsed.mockResolvedValue(undefined);
    const { result } = renderHook(usePresetsAndMutations, {
      wrapper: wrapperFor(createClient()),
    });
    await waitFor(() =>
      expect(result.current.presets.map((p) => p.id)).toEqual(['newer', 'older'])
    );

    await act(async () => {
      await result.current.mutations.markUsed.mutateAsync(older);
    });

    await waitFor(() =>
      expect(result.current.presets.map((p) => p.id)).toEqual(['older', 'newer'])
    );
    expect(mockMarkPresetUsed).toHaveBeenCalledWith('user-1', 'older');
  });

  it('leaves an unloaded list alone and reloads it once a write settles', async () => {
    mockSavePreset.mockResolvedValue(undefined);
    const client = createClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useFilterPresetMutations(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.save.mutateAsync(listPreset('new'));
    });

    // Writing just the new preset would pass for the whole list until the next refetch.
    expect(client.getQueryData(['filterPresets', 'user-1'])).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['filterPresets', 'user-1'] });
  });

  it('does not reload when the cached list was updated in place', async () => {
    mockGetUserPresets.mockResolvedValue([listPreset('l1')]);
    mockRenamePreset.mockResolvedValue(undefined);
    const client = createClient();
    const { result } = renderHook(usePresetsAndMutations, { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.mutations.rename.mutateAsync({ id: 'l1', name: 'Renamed' });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
