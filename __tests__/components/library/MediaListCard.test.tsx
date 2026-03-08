import { MediaListCard } from '@/src/components/library/MediaListCard';
import { ListMediaItem } from '@/src/services/ListService';
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

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => require('react').createElement('View', { testID: 'list-membership-badge' }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: (props: any) => require('react').createElement('Image', props),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (_mediaType: 'movie' | 'tv', _mediaId: number, fallbackPosterPath: string | null) =>
      fallbackPosterPath,
  }),
}));

const item: ListMediaItem = {
  id: 10,
  title: 'Selection Test',
  poster_path: '/poster.jpg',
  media_type: 'movie',
  vote_average: 8.5,
  release_date: '2024-01-01',
  addedAt: 123,
};

describe('MediaListCard', () => {
  it('shows selection badge and check when selected in selection mode', () => {
    const { getByTestId } = render(
      <MediaListCard
        item={item}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={true}
        isSelected={true}
        movieLabel="Movie"
        tvShowLabel="TV Show"
      />
    );

    expect(getByTestId('media-list-card-selection-badge')).toBeTruthy();
    expect(getByTestId('animated-check-visible')).toBeTruthy();
  });

  it('shows selection badge without check when unselected in selection mode', () => {
    const { getByTestId, queryByTestId } = render(
      <MediaListCard
        item={item}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={true}
        isSelected={false}
        movieLabel="Movie"
        tvShowLabel="TV Show"
      />
    );

    expect(getByTestId('media-list-card-selection-badge')).toBeTruthy();
    expect(queryByTestId('animated-check-visible')).toBeNull();
  });

  it('does not render selection badge outside selection mode', () => {
    const { queryByTestId } = render(
      <MediaListCard
        item={item}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={false}
        isSelected={false}
        movieLabel="Movie"
        tvShowLabel="TV Show"
      />
    );

    expect(queryByTestId('media-list-card-selection-badge')).toBeNull();
  });

  it('renders a list membership badge when list ids are provided', () => {
    const { getByTestId } = render(
      <MediaListCard
        item={item}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        listIds={['watchlist']}
        movieLabel="Movie"
        tvShowLabel="TV Show"
      />
    );

    expect(getByTestId('list-membership-badge')).toBeTruthy();
  });

  it('suppresses press after long press until press out resets the guard', () => {
    jest.useFakeTimers();

    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { UNSAFE_getByType } = render(
      <MediaListCard
        item={item}
        onPress={onPress}
        onLongPress={onLongPress}
        movieLabel="Movie"
        tvShowLabel="TV Show"
      />
    );
    const { Pressable } = require('react-native');
    const pressable = UNSAFE_getByType(Pressable);

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
