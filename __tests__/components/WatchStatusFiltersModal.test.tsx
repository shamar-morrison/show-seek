import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

let mockListPresets: any[] = [];
const mockPresetActions = {
  createDiscoverPreset: jest.fn(),
  createListPreset: jest.fn(),
  renamePreset: jest.fn(),
  replacePreset: jest.fn(),
  deletePreset: jest.fn(),
  recordApplied: jest.fn(),
};

const mockSheetPresent = jest.fn(async () => {});
const mockSheetDismiss = jest.fn(async () => {});
let mockSheetProps: any;

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const TrueSheet = React.forwardRef((props: any, ref: any) => {
    mockSheetProps = props;
    React.useImperativeHandle(ref, () => ({
      present: mockSheetPresent,
      dismiss: mockSheetDismiss,
    }));
    return <View>{props.children}</View>;
  });
  return { TrueSheet };
});

jest.mock('react-native-gesture-handler', () => {
  const { Pressable, View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

let mockIsGuest = false;
const mockRequireAccount = jest.fn();
jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({ isGuest: mockIsGuest, requireAccount: mockRequireAccount }),
}));

let mockPresetSheetsProps: any;
const mockPresetSheets = {
  openActions: jest.fn(async () => {}),
  openManage: jest.fn(async () => {}),
  openSave: jest.fn(async () => {}),
};
jest.mock('@/src/components/filters/FilterPresetSheets', () => {
  const React = require('react');
  const Stub = React.forwardRef((props: any, ref: any) => {
    mockPresetSheetsProps = props;
    React.useImperativeHandle(ref, () => mockPresetSheets);
    return null;
  });
  Stub.displayName = 'FilterPresetSheets';
  return { __esModule: true, default: Stub };
});

jest.mock('@/src/hooks/useFilterPresets', () => {
  const { partitionListPresets } = jest.requireActual('@/src/utils/filterPresets');
  return {
    useListPresets: (caps: any) => ({
      all: mockListPresets,
      ...partitionListPresets(mockListPresets, caps),
    }),
  };
});

jest.mock('@/src/hooks/useFilterPresetActions', () => ({
  useFilterPresetActions: () => mockPresetActions,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

const genreMap = { 28: 'Action', 18: 'Drama' };

const renderModal = (props: Partial<React.ComponentProps<typeof WatchStatusFiltersModal>> = {}) => {
  const onApplyFilters = jest.fn();
  const utils = render(
    <WatchStatusFiltersModal
      visible
      onClose={jest.fn()}
      filters={DEFAULT_WATCH_STATUS_FILTERS}
      onApplyFilters={onApplyFilters}
      genreMap={genreMap}
      {...props}
    />
  );
  return { ...utils, onApplyFilters };
};

describe('WatchStatusFiltersModal', () => {
  it('lays list filters out two per row, with Type, Your rating, and Runtime', () => {
    const { getAllByTestId } = renderModal({ showListFilters: true });

    const rows = getAllByTestId('filters-row');
    expect(rows).toHaveLength(3);
    // Each select also repeats its label in its (hidden) option picker, hence getAllByText.
    expect(within(rows[0]).getAllByText('Type').length).toBeGreaterThan(0);
    expect(within(rows[0]).getAllByText('Genres').length).toBeGreaterThan(0);
    expect(within(rows[1]).getAllByText('TMDB Rating').length).toBeGreaterThan(0);
    expect(within(rows[1]).getAllByText('Your Rating').length).toBeGreaterThan(0);
    expect(within(rows[2]).getAllByText('Release Year').length).toBeGreaterThan(0);
    expect(within(rows[2]).getAllByText('Runtime').length).toBeGreaterThan(0);
  });

  it('hides the list-only filters and keeps an odd last filter at half width', () => {
    const { getAllByTestId, queryByText } = renderModal({ showMediaTypeFilter: false });

    const rows = getAllByTestId('filters-row');
    expect(rows).toHaveLength(2);
    expect(queryByText('Type')).toBeNull();
    expect(queryByText('Your Rating')).toBeNull();
    expect(queryByText('Runtime')).toBeNull();
    // The last row still has two cells; the second is an empty spacer.
    expect(rows[1].children).toHaveLength(2);
  });

  it('disables Apply until the choices differ from the filters in use', () => {
    const { getByTestId, getByText, getAllByText, onApplyFilters } = renderModal({
      showListFilters: true,
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, runtime: '60to90', userRating: 8 },
    });

    expect(getByText('1–1.5 h')).toBeTruthy();
    expect(getAllByText('8+ stars').length).toBeGreaterThan(0);

    const apply = getByTestId('filters-apply-button');
    expect(apply.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(apply);
    expect(onApplyFilters).not.toHaveBeenCalled();

    fireEvent.press(getByText('Clear All'));
    expect(getByTestId('filters-apply-button').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(getByTestId('filters-apply-button'));
    expect(onApplyFilters).toHaveBeenCalledWith(DEFAULT_WATCH_STATUS_FILTERS);
  });

  it('shows a live match count, hides it when unknown, and warns when nothing matches', () => {
    const getMatchCount = jest.fn((filters) =>
      filters.runtime !== 'any' ? null : filters.mediaType === 'tv' ? 0 : 12
    );
    const { getByTestId, queryByTestId, rerender } = renderModal({ getMatchCount });

    expect(getByTestId('filters-match-count').props.children).toBe('12 titles match');

    rerender(
      <WatchStatusFiltersModal
        visible
        onClose={jest.fn()}
        filters={{ ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'tv' }}
        onApplyFilters={jest.fn()}
        genreMap={genreMap}
        getMatchCount={getMatchCount}
      />
    );
    expect(getByTestId('filters-match-count').props.children).toBe('No titles match these filters');

    rerender(
      <WatchStatusFiltersModal
        visible
        onClose={jest.fn()}
        filters={{ ...DEFAULT_WATCH_STATUS_FILTERS, runtime: '60to90' }}
        onApplyFilters={jest.fn()}
        genreMap={genreMap}
        getMatchCount={getMatchCount}
      />
    );
    expect(queryByTestId('filters-match-count')).toBeNull();
  });

  describe('opening and closing', () => {
    beforeEach(() => jest.clearAllMocks());

    it('presents while visible and dismisses when hidden', () => {
      const onClose = jest.fn();
      const props = {
        onClose,
        filters: DEFAULT_WATCH_STATUS_FILTERS,
        onApplyFilters: jest.fn(),
        genreMap,
      };
      const { rerender } = render(<WatchStatusFiltersModal visible={false} {...props} />);
      expect(mockSheetPresent).not.toHaveBeenCalled();

      rerender(<WatchStatusFiltersModal visible {...props} />);
      expect(mockSheetPresent).toHaveBeenCalledTimes(1);

      rerender(<WatchStatusFiltersModal visible={false} {...props} />);
      expect(mockSheetDismiss).toHaveBeenCalled();
    });

    it('never dismisses a sheet that is not open', () => {
      // On Android that leaves TrueSheet stuck "dismissing", so X stops closing it.
      const onClose = jest.fn();
      const props = {
        onClose,
        filters: DEFAULT_WATCH_STATUS_FILTERS,
        onApplyFilters: jest.fn(),
        genreMap,
      };
      const { rerender } = render(<WatchStatusFiltersModal visible={false} {...props} />);
      expect(mockSheetDismiss).not.toHaveBeenCalled();

      // Closed with X or a swipe; the screen then hides it.
      rerender(<WatchStatusFiltersModal visible {...props} />);
      act(() => mockSheetProps.onDidDismiss());
      expect(onClose).toHaveBeenCalled();
      rerender(<WatchStatusFiltersModal visible={false} {...props} />);
      expect(mockSheetDismiss).not.toHaveBeenCalled();
    });

    it('reports a swipe-down as Close', () => {
      const onClose = jest.fn();
      renderModal({ onClose });
      act(() => mockSheetProps.onDidDismiss());
      expect(onClose).toHaveBeenCalled();
    });

    it('does not close when stepping aside for a preset sheet, and keeps the picks', async () => {
      const onClose = jest.fn();
      const { getByTestId } = renderModal({ onClose, showListFilters: true });

      await act(async () => {
        await mockPresetSheetsProps.hideParent();
      });
      act(() => mockSheetProps.onDidDismiss());
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => {
        await mockPresetSheetsProps.showParent();
      });
      expect(mockSheetPresent).toHaveBeenCalledTimes(2);
      act(() => mockSheetProps.onDidDismiss());
      expect(onClose).toHaveBeenCalled();
      expect(getByTestId('filters-apply-button')).toBeTruthy();
    });
  });

  describe('saved presets', () => {
    const moviePreset = {
      id: 'movies',
      scope: 'list' as const,
      name: 'Good movies',
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'movie' as const, rating: 7 },
      createdAt: new Date(2026, 0, 2),
    };
    const runtimePreset = {
      id: 'short',
      scope: 'list' as const,
      name: 'Short',
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, runtime: 'under30' as const },
      createdAt: new Date(2026, 0, 1),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockIsGuest = false;
      mockListPresets = [moviePreset, runtimePreset];
    });

    afterEach(() => {
      mockListPresets = [];
    });

    it('applies a preset in one tap, with media type dropped on single-type screens', () => {
      const { getByTestId, onApplyFilters } = renderModal({
        showMediaTypeFilter: false,
        screenMediaType: 'movie',
      });

      fireEvent.press(getByTestId('list-presets-chip-movies'));

      expect(onApplyFilters).toHaveBeenCalledWith({ ...moviePreset.filters, mediaType: 'all' });
      expect(mockPresetActions.recordApplied).toHaveBeenCalledWith(moviePreset);
    });

    it('hides presets the screen cannot fully apply and says how many', () => {
      const { queryByTestId, getByTestId } = renderModal({
        showMediaTypeFilter: false,
        screenMediaType: 'movie',
      });

      expect(queryByTestId('list-presets-chip-short')).toBeNull();
      expect(getByTestId('list-presets-footnote').props.children).toBe(
        "1 saved filter doesn't apply here"
      );
      expect(mockPresetSheetsProps.hiddenCount).toBe(1);
    });

    it('shows every preset on full list screens', () => {
      const { getByTestId } = renderModal({ showListFilters: true });
      expect(getByTestId('list-presets-chip-movies')).toBeTruthy();
      expect(getByTestId('list-presets-chip-short')).toBeTruthy();
    });

    it('shows no presets on a single-type screen that does not say its type', () => {
      const { queryByTestId } = renderModal({ showMediaTypeFilter: false });
      expect(queryByTestId('list-presets')).toBeNull();
    });

    it('opens the options, the list and naming in their own sheets', () => {
      const { getByTestId } = renderModal({
        showListFilters: true,
        filters: { ...DEFAULT_WATCH_STATUS_FILTERS, year: 1999 },
      });

      fireEvent(getByTestId('list-presets-chip-short'), 'longPress');
      expect(mockPresetSheets.openActions).toHaveBeenCalledWith(runtimePreset);

      fireEvent.press(getByTestId('list-presets-manage'));
      expect(mockPresetSheets.openManage).toHaveBeenCalled();

      fireEvent.press(getByTestId('list-presets-save'));
      expect(mockPresetSheets.openSave).toHaveBeenCalled();
      expect(mockPresetSheetsProps.currentSummary).toBe('1999');
    });

    it('saves the current choices and checks names against every list preset', () => {
      const filters = { ...DEFAULT_WATCH_STATUS_FILTERS, year: 1999 };
      renderModal({ showMediaTypeFilter: false, screenMediaType: 'movie', filters });

      expect(mockPresetSheetsProps.validateName('short')).toBe('duplicate');
      mockPresetSheetsProps.onCreate('From 1999');
      expect(mockPresetActions.createListPreset).toHaveBeenCalledWith('From 1999', filters);
    });

    it('labels Your rating in summaries so it is not mistaken for the TMDB rating', () => {
      renderModal({
        showListFilters: true,
        filters: { ...DEFAULT_WATCH_STATUS_FILTERS, rating: 7, userRating: 8 },
      });
      expect(mockPresetSheetsProps.currentSummary).toBe('7+ stars · Your Rating 8+ stars');
    });

    it('keeps a preset media type when it is updated from a single-type screen', () => {
      const filters = { ...DEFAULT_WATCH_STATUS_FILTERS, rating: 8 };
      renderModal({ showMediaTypeFilter: false, screenMediaType: 'movie', filters });

      mockPresetSheetsProps.onUpdate(moviePreset);

      expect(mockPresetActions.replacePreset).toHaveBeenCalledWith({
        ...moviePreset,
        filters: { ...filters, mediaType: 'movie' },
      });
    });

    it('asks guests to sign in instead of naming', async () => {
      mockIsGuest = true;
      const { getByTestId } = renderModal({
        showListFilters: true,
        filters: { ...DEFAULT_WATCH_STATUS_FILTERS, year: 1999 },
      });

      await act(async () => {
        fireEvent.press(getByTestId('list-presets-save'));
      });

      expect(mockPresetSheets.openSave).not.toHaveBeenCalled();
      expect(mockRequireAccount).toHaveBeenCalled();
    });
  });
});
