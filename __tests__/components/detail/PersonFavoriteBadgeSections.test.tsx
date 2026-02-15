import { CreatorsSection } from '@/src/components/detail/CreatorsSection';
import { DirectorsSection } from '@/src/components/detail/DirectorsSection';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockUseIsPersonFavorited = jest.fn();

jest.mock('@/src/hooks/useFavoritePersons', () => ({
  useIsPersonFavorited: (personId: number) => mockUseIsPersonFavorited(personId),
}));

jest.mock('@/src/components/ui/FavoritePersonBadge', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FavoritePersonBadge: () => React.createElement(View, { testID: 'favorite-person-badge' }),
  };
});

jest.mock('@/src/components/ui/MediaImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MediaImage: () => React.createElement(View, { testID: 'media-image' }),
  };
});

jest.mock('@/src/components/detail/detailStyles', () => ({
  useDetailStyles: () => ({
    castCard: {},
    castImageContainer: {},
    castImage: {},
    castName: {},
    characterName: {},
    sectionHeader: {},
    sectionTitle: {},
    castList: {},
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Person favorite badge in detail sections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsPersonFavorited.mockImplementation((personId: number) => ({
      isFavorited: personId === 101,
      isLoading: false,
    }));
  });

  it('DirectorsSection shows heart badge only for favorited directors', () => {
    const directors = [
      {
        id: 101,
        name: 'Favorited Director',
        profile_path: '/fav.jpg',
        job: 'Director',
      },
      {
        id: 202,
        name: 'Non-Favorited Director',
        profile_path: '/not-fav.jpg',
        job: 'Director',
      },
    ];

    const { queryAllByTestId } = render(
      <DirectorsSection directors={directors as any} onDirectorPress={jest.fn()} />
    );

    expect(queryAllByTestId('favorite-person-badge')).toHaveLength(1);
    expect(mockUseIsPersonFavorited).toHaveBeenCalledWith(101);
    expect(mockUseIsPersonFavorited).toHaveBeenCalledWith(202);
  });

  it('CreatorsSection shows heart badge only for favorited creators', () => {
    const creators = [
      {
        id: 101,
        name: 'Favorited Creator',
        profile_path: '/fav-creator.jpg',
      },
      {
        id: 303,
        name: 'Non-Favorited Creator',
        profile_path: '/not-fav-creator.jpg',
      },
    ];

    const { queryAllByTestId } = render(
      <CreatorsSection creators={creators} onCreatorPress={jest.fn()} />
    );

    expect(queryAllByTestId('favorite-person-badge')).toHaveLength(1);
    expect(mockUseIsPersonFavorited).toHaveBeenCalledWith(101);
    expect(mockUseIsPersonFavorited).toHaveBeenCalledWith(303);
  });
});
