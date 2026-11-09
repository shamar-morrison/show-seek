import DiscoverFiltersSheet, {
  type DiscoverFiltersSheetRef,
} from '@/src/components/discover/DiscoverFiltersSheet';
import { DEFAULT_DISCOVER_FILTERS, type DiscoverFilterState } from '@/src/utils/discoverFilters';
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
  const ref = createRef<DiscoverFiltersSheetRef>();
  const utils = render(
    <DiscoverFiltersSheet
      ref={ref}
      filters={filters}
      onApply={onApply}
      mediaType="movie"
      genreMap={{}}
    />
  );
  return { ...utils, onApply, ref };
};

const isDisabled = (node: any) => node.props.accessibilityState?.disabled === true;

describe('DiscoverFiltersSheet', () => {
  beforeEach(() => jest.clearAllMocks());

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
});
