import RegionScreen from '@/app/(tabs)/profile/region';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/RegionProvider', () => {
  const actual = jest.requireActual('@/src/context/RegionProvider');
  return {
    SUPPORTED_REGIONS: actual.SUPPORTED_REGIONS,
    useRegion: () => ({ region: 'US', setRegion: jest.fn() }),
  };
});
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'l' } }));

describe('RegionScreen search', () => {
  it('keeps the search field outside the scrolling list', () => {
    const { getByTestId, UNSAFE_getByType } = render(<RegionScreen />);
    const scroll = UNSAFE_getByType('ScrollView' as never);
    expect(getByTestId('region-search')).toBeTruthy();
    expect(scroll.findAll((node: any) => node.props.testID === 'region-search').length).toBe(0);
  });

  it('filters regions as you type, including common other names', () => {
    const { getByTestId, getByText, queryByText } = render(<RegionScreen />);

    fireEvent.changeText(getByTestId('region-search'), 'uk');

    expect(getByText('United Kingdom')).toBeTruthy();
    expect(queryByText('Germany')).toBeNull();
  });

  it('says so when nothing matches, and the clear button brings everything back', () => {
    const { getByTestId, getByText, queryByTestId } = render(<RegionScreen />);

    fireEvent.changeText(getByTestId('region-search'), 'atlantis');
    expect(getByTestId('region-search-empty')).toBeTruthy();

    fireEvent.press(getByTestId('region-search-clear'));
    expect(queryByTestId('region-search-empty')).toBeNull();
    expect(getByText('Germany')).toBeTruthy();
  });
});
