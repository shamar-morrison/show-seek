import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CalendarSourceFilterModal } from '@/src/components/calendar/CalendarSourceFilterModal';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const React = require('react');

  const FlatList = ({
    data = [],
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ...props
  }: any) => {
    const { View } = actual;

    return (
      <View {...props}>
        {data.length === 0 && ListEmptyComponent}
        {data.map((item: any, index: number) => (
          <View key={keyExtractor ? keyExtractor(item, index) : String(index)}>
            {renderItem({ item, index })}
          </View>
        ))}
      </View>
    );
  };

  FlatList.displayName = 'MockFlatList';

  return {
    ...actual,
    FlatList,
  };
});

const mockToastShow = jest.fn();

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Error: 'Error',
    Warning: 'Warning',
  },
}));

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');

  const Toast = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      show: mockToastShow,
    }));

    return null;
  });

  Toast.displayName = 'MockToast';

  return {
    __esModule: true,
    default: Toast,
  };
});

const customSources = [
  { id: 'road-trip', name: 'Road Trip' },
  { id: 'horror', name: 'Horror' },
  { id: 'short-bingeable', name: 'Short & Bingeable' },
  { id: 'foreign-language-films', name: 'Foreign Language Films' },
];

const defaultSources = [
  'watchlist',
  'favorites',
  'currently-watching',
  'reminders',
];

function renderModal(
  props: Partial<React.ComponentProps<typeof CalendarSourceFilterModal>> = {}
) {
  const onApply = jest.fn();
  const onClose = jest.fn();

  render(
    <CalendarSourceFilterModal
      visible
      selectedSources={[...defaultSources]}
      customSources={customSources}
      onClose={onClose}
      onApply={onApply}
      {...props}
    />
  );

  return { onApply, onClose };
}

describe('CalendarSourceFilterModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders default and custom list options', () => {
    renderModal();

    expect(screen.getByText('Road Trip')).toBeTruthy();
    expect(screen.getByText('Horror')).toBeTruthy();
    expect(screen.getByText('Short & Bingeable')).toBeTruthy();
    expect(screen.getByText('Foreign Language Films')).toBeTruthy();
  });

  it('shows a toast and holds the cap when a seventh list is tapped', () => {
    const { onApply } = renderModal();

    fireEvent.press(screen.getByText('Road Trip'));
    fireEvent.press(screen.getByText('Horror'));
    fireEvent.press(screen.getByText('Short & Bingeable'));
    fireEvent.press(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith(
      expect.arrayContaining([
        'watchlist',
        'favorites',
        'currently-watching',
        'reminders',
        'road-trip',
        'horror',
        'short-bingeable',
      ])
    );
    expect(onApply.mock.calls[0][0]).toHaveLength(7);

    // Seventh list attempt surfaces the error toast instead of selecting.
    fireEvent.press(screen.getByText('Foreign Language Films'));
    expect(mockToastShow).toHaveBeenCalledWith(
      'You can select up to 6 lists'
    );
  });

  it('does not count reminders toward the list cap', () => {
    const { onApply } = renderModal({
      selectedSources: [
        'watchlist',
        'favorites',
        'currently-watching',
        'road-trip',
        'horror',
        'short-bingeable',
      ],
    });

    // Reminders toggles freely at the cap; lists do not.
    fireEvent.press(screen.getByText('Reminders'));
    fireEvent.press(screen.getByText('Apply'));

    const applied: string[] = onApply.mock.calls[0][0];
    expect(applied).toContain('reminders');
    expect(applied).toHaveLength(7);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('allows unchecking below the cap and resets to defaults', () => {
    const { onApply } = renderModal({
      selectedSources: [
        'watchlist',
        'favorites',
        'currently-watching',
        'reminders',
        'road-trip',
        'horror',
        'short-bingeable',
      ],
    });

    fireEvent.press(screen.getByText('Road Trip'));
    fireEvent.press(screen.getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith(
      expect.not.arrayContaining(['road-trip'])
    );
  });
});
