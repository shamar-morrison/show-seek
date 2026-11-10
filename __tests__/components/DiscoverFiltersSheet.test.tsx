import DiscoverFiltersSheet, {
  type DiscoverFiltersSheetRef,
} from '@/src/components/discover/DiscoverFiltersSheet';
import { DEFAULT_DISCOVER_FILTERS, type DiscoverFilterState } from '@/src/utils/discoverFilters';
import type { DiscoverFilterPreset } from '@/src/utils/filterPresets';
import { act, fireEvent, render } from '@testing-library/react-native';
import React, { createRef } from 'react';

const mockSheetPresent = jest.fn(async () => {});
const mockSheetDismiss = jest.fn(async () => {});
let mockFieldProps: { filters: DiscoverFilterState; onChange: (f: DiscoverFilterState) => void };

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const TrueSheet = React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockSheetPresent,
      dismiss: mockSheetDismiss,
    }));
    return <View>{children}</View>;
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
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

let mockPresets: DiscoverFilterPreset[] = [];
let mockIsGuest = false;
const mockRequireAccount = jest.fn(() => false);
const mockPresetActions = {
  createDiscoverPreset: jest.fn(),
  createListPreset: jest.fn(),
  renamePreset: jest.fn(),
  replacePreset: jest.fn(),
  deletePreset: jest.fn(),
  recordApplied: jest.fn(),
};

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

jest.mock('@/src/hooks/useDiscoverFilterOptions', () => ({
  useDiscoverFilterOptions: (mediaType: string) => ({
    languageNames: {},
    providerNames: mediaType === 'tv' ? { 8: 'Netflix' } : {},
  }),
}));

jest.mock('@/src/hooks/useGenres', () => ({
  useAllGenres: () => ({ data: { 27: 'Horror', 9648: 'Mystery' } }),
}));

jest.mock('@/src/hooks/useFilterPresets', () => ({
  useDiscoverPresets: () => mockPresets,
}));

jest.mock('@/src/hooks/useFilterPresetActions', () => ({
  useFilterPresetActions: () => mockPresetActions,
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({ isGuest: mockIsGuest, requireAccount: mockRequireAccount }),
}));

// The fields are covered by their own components; here they only need to change the draft.
jest.mock('@/src/components/DiscoverFilters', () => ({
  __esModule: true,
  default: (props: any) => {
    mockFieldProps = props;
    return null;
  },
}));

const renderSheet = (filters: DiscoverFilterState = DEFAULT_DISCOVER_FILTERS) => {
  const onApply = jest.fn();
  const onApplyPreset = jest.fn();
  const ref = createRef<DiscoverFiltersSheetRef>();
  const utils = render(
    <DiscoverFiltersSheet
      ref={ref}
      filters={filters}
      onApply={onApply}
      onApplyPreset={onApplyPreset}
      mediaType="movie"
      genreMap={{}}
    />
  );
  return { ...utils, onApply, onApplyPreset, ref };
};

const tvHorror: DiscoverFilterPreset = {
  id: 'tv-horror',
  scope: 'discover',
  name: 'TV horror',
  mediaType: 'tv',
  filters: { ...DEFAULT_DISCOVER_FILTERS, genres: [9648] },
  createdAt: new Date(2026, 0, 1),
};

const isDisabled = (node: any) => node.props.accessibilityState?.disabled === true;

describe('DiscoverFiltersSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPresets = [];
    mockIsGuest = false;
  });

  it('starts from the filters in use and keeps Apply disabled until something changes', async () => {
    const applied = { ...DEFAULT_DISCOVER_FILTERS, rating: 7 };
    const { getByTestId, ref } = renderSheet(applied);

    await act(async () => {
      await ref.current?.present();
    });
    expect(mockSheetPresent).toHaveBeenCalled();
    expect(mockFieldProps.filters).toEqual(applied);
    expect(isDisabled(getByTestId('discover-filters-apply'))).toBe(true);

    act(() => mockFieldProps.onChange({ ...applied, runtime: '90to120' }));
    expect(isDisabled(getByTestId('discover-filters-apply'))).toBe(false);
  });

  it('applies the draft once and closes', async () => {
    const { getByTestId, onApply, ref } = renderSheet();
    await act(async () => {
      await ref.current?.present();
    });

    act(() => mockFieldProps.onChange({ ...DEFAULT_DISCOVER_FILTERS, runtime: '60to90' }));
    fireEvent.press(getByTestId('discover-filters-apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_DISCOVER_FILTERS, runtime: '60to90' });
    expect(mockSheetDismiss).toHaveBeenCalled();
  });

  it('does not apply picks until Apply is tapped, and drops them when reopened', async () => {
    const { onApply, ref } = renderSheet();
    await act(async () => {
      await ref.current?.present();
    });
    act(() => mockFieldProps.onChange({ ...DEFAULT_DISCOVER_FILTERS, year: 2020 }));
    expect(onApply).not.toHaveBeenCalled();

    await act(async () => {
      await ref.current?.present();
    });
    expect(mockFieldProps.filters).toEqual(DEFAULT_DISCOVER_FILTERS);
  });

  it('Clear All resets the draft, so Apply can then clear the filters in use', async () => {
    const applied = { ...DEFAULT_DISCOVER_FILTERS, runtime: 'over150' as const, rating: 6 };
    const { getByTestId, onApply, ref } = renderSheet(applied);
    await act(async () => {
      await ref.current?.present();
    });

    fireEvent.press(getByTestId('discover-filters-clear'));
    expect(mockFieldProps.filters).toEqual(DEFAULT_DISCOVER_FILTERS);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('discover-filters-apply'));
    expect(onApply).toHaveBeenCalledWith(DEFAULT_DISCOVER_FILTERS);
  });

  it('disables Clear All when the draft is already the defaults', async () => {
    const { getByTestId, ref } = renderSheet();
    await act(async () => {
      await ref.current?.present();
    });
    expect(isDisabled(getByTestId('discover-filters-clear'))).toBe(true);
  });

  describe('saved presets', () => {
    it('applies a preset straight away and closes the sheet', async () => {
      mockPresets = [tvHorror];
      const { getByTestId, onApply, onApplyPreset, ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });

      fireEvent.press(getByTestId('discover-presets-chip-tv-horror'));

      expect(onApplyPreset).toHaveBeenCalledWith(tvHorror);
      expect(onApply).not.toHaveBeenCalled();
      expect(mockPresetActions.recordApplied).toHaveBeenCalledWith(tvHorror);
      expect(mockSheetDismiss).toHaveBeenCalled();
    });

    it('opens the options sheet on long press and the list from Manage', async () => {
      mockPresets = [tvHorror];
      const { getByTestId, ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });

      fireEvent(getByTestId('discover-presets-chip-tv-horror'), 'longPress');
      expect(mockPresetSheets.openActions).toHaveBeenCalledWith(tvHorror);

      fireEvent.press(getByTestId('discover-presets-manage'));
      expect(mockPresetSheets.openManage).toHaveBeenCalled();
    });

    it('names the draft for the current tab, with a summary of it', async () => {
      const { getByTestId, ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });
      const draft = { ...DEFAULT_DISCOVER_FILTERS, genres: [27], watchProviders: [8] };
      act(() => mockFieldProps.onChange(draft));

      fireEvent.press(getByTestId('discover-presets-save'));
      expect(mockPresetSheets.openSave).toHaveBeenCalled();
      expect(mockPresetSheetsProps.currentSummary).toBe('Horror · Netflix');

      mockPresetSheetsProps.onCreate('Scary');
      expect(mockPresetActions.createDiscoverPreset).toHaveBeenCalledWith('Scary', 'movie', draft);
    });

    it('steps aside for preset sheets without losing the draft', async () => {
      const { ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });
      const draft = { ...DEFAULT_DISCOVER_FILTERS, rating: 6 };
      act(() => mockFieldProps.onChange(draft));

      await act(async () => {
        await mockPresetSheetsProps.hideParent();
        await mockPresetSheetsProps.showParent();
      });

      expect(mockSheetDismiss).toHaveBeenCalled();
      expect(mockSheetPresent).toHaveBeenCalledTimes(2);
      expect(mockFieldProps.filters).toEqual(draft);
    });

    it('replaces a preset with the draft and moves it to this tab', async () => {
      mockPresets = [tvHorror];
      const { ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });
      const draft = { ...DEFAULT_DISCOVER_FILTERS, rating: 8 };
      act(() => mockFieldProps.onChange(draft));

      mockPresetSheetsProps.onUpdate(tvHorror);
      expect(mockPresetActions.replacePreset).toHaveBeenCalledWith({
        ...tvHorror,
        mediaType: 'movie',
        filters: draft,
      });
    });

    it('applies a preset picked from the list without closing the sheet again', async () => {
      mockPresets = [tvHorror];
      const { onApplyPreset, ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });

      mockPresetSheetsProps.onApply(tvHorror);
      expect(onApplyPreset).toHaveBeenCalledWith(tvHorror);
      expect(mockSheetDismiss).not.toHaveBeenCalled();
    });

    it('disables Save while the draft has no filters', async () => {
      const { getByTestId, ref } = renderSheet();
      await act(async () => {
        await ref.current?.present();
      });
      expect(isDisabled(getByTestId('discover-presets-save'))).toBe(true);
    });

    it('asks guests to sign in instead of naming', async () => {
      mockIsGuest = true;
      const { getByTestId, ref } = renderSheet({ ...DEFAULT_DISCOVER_FILTERS, rating: 7 });
      await act(async () => {
        await ref.current?.present();
      });

      await act(async () => {
        fireEvent.press(getByTestId('discover-presets-save'));
      });

      expect(mockPresetSheets.openSave).not.toHaveBeenCalled();
      expect(mockSheetDismiss).toHaveBeenCalled();
      expect(mockRequireAccount).toHaveBeenCalled();
    });
  });
});
