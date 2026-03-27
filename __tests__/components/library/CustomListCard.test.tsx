import { CustomListCard } from '@/src/components/library/CustomListCard';
import { UserList } from '@/src/services/ListService';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-native', () => {
  const React = require('react');
  const createComponent = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  const Pressable = ({ children, disabled, onPress, onLongPress, ...props }: any) =>
    React.createElement(
      'Pressable',
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        onLongPress: disabled ? undefined : onLongPress,
        onPressOut: disabled ? undefined : props.onPressOut,
      },
      children
    );

  return {
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: any) => style,
    },
    View: createComponent('View'),
    Text: createComponent('Text'),
    Pressable,
  };
});

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: ({ visible }: { visible: boolean }) =>
    visible ? require('react').createElement('View', { testID: 'animated-check-visible' }) : null,
}));

jest.mock('@/src/components/library/StackedPosterPreview', () => ({
  StackedPosterPreview: () =>
    require('react').createElement('View', { testID: 'stacked-poster-preview' }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

const list: UserList = {
  id: 'list-1',
  name: 'Sci-Fi Queue',
  description: 'Future worlds',
  items: {
    '1-movie': {
      id: 1,
      title: 'Movie One',
      poster_path: '/one.jpg',
      media_type: 'movie',
      vote_average: 7.5,
      release_date: '2024-01-01',
      addedAt: 123,
    },
  },
  createdAt: 1,
};

describe('CustomListCard', () => {
  it('shows selection badge and check when selected in selection mode', () => {
    const { getByTestId } = render(
      <CustomListCard
        list={list}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={true}
        isSelected={true}
      />
    );

    expect(getByTestId('custom-list-card-selection-badge-list-1')).toBeTruthy();
    expect(getByTestId('animated-check-visible')).toBeTruthy();
  });

  it('does not render selection badge outside selection mode', () => {
    const { queryByTestId } = render(
      <CustomListCard list={list} onPress={jest.fn()} onLongPress={jest.fn()} />
    );

    expect(queryByTestId('custom-list-card-selection-badge-list-1')).toBeNull();
  });

  it('suppresses press after long press until press out resets the guard', () => {
    jest.useFakeTimers();

    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { getByTestId } = render(
      <CustomListCard list={list} onPress={onPress} onLongPress={onLongPress} />
    );
    const pressable = getByTestId('custom-list-card-list-1');

    fireEvent(pressable, 'longPress');
    fireEvent(pressable, 'press');

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    fireEvent(pressable, 'pressOut');

    act(() => {
      jest.runAllTimers();
    });

    fireEvent(pressable, 'press');

    expect(onPress).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
