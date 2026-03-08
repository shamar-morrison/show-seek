import { useRatingScreenLogic } from '@/src/hooks/useRatingScreenLogic';
import { act, renderHook } from '@testing-library/react-native';

const mockUseViewModeToggle = jest.fn();

type TestItem = {
  rating: { id: string; rating: number; ratedAt: number };
  movie: any;
};

jest.mock('@/src/hooks/useGenres', () => ({
  useAllGenres: () => ({
    data: {},
    isLoading: false,
  }),
}));

jest.mock('@/src/hooks/useViewModeToggle', () => ({
  useViewModeToggle: (...args: any[]) => mockUseViewModeToggle(...args),
}));

jest.mock('@/src/components/ListActionsModal', () => ({
  ListActionsIcon: () => null,
}));

jest.mock('@/src/components/MediaSortModal', () => ({
  DEFAULT_SORT_STATE: {
    option: 'recentlyAdded',
    direction: 'desc',
  },
}));

jest.mock('@/src/utils/listActions', () => ({
  createSortAction: ({ onPress, showBadge }: { onPress: () => void; showBadge?: boolean }) => ({
    id: 'sort',
    icon: () => null,
    label: 'library.sortBy',
    onPress,
    showBadge,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('useRatingScreenLogic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseViewModeToggle.mockReturnValue({
      viewMode: 'grid',
      isLoadingPreference: false,
      toggleViewMode: jest.fn(),
    });
  });

  it('dismisses list actions and closes active search when selection mode starts', () => {
    const dismiss = jest.fn();
    const onClose = jest.fn();
    const searchState = {
      isActive: true,
      query: 'movie',
      onQueryChange: jest.fn(),
      onClose,
      placeholder: 'Search',
    };
    const useTestHook = ({ isSelectionMode }: { isSelectionMode: boolean }) =>
      useRatingScreenLogic<TestItem>({
        storageKey: 'movieRatingsViewMode',
        data: [
          {
            rating: { id: '1', rating: 8, ratedAt: 100 },
            movie: { id: 1, title: 'Movie One', release_date: '2024-01-01' },
          },
        ],
        getMediaFromItem: (item) => item.movie,
        searchState,
        isSelectionMode,
      });

    const { result, rerender } = renderHook<
      ReturnType<typeof useTestHook>,
      { isSelectionMode: boolean }
    >(useTestHook, {
      initialProps: { isSelectionMode: false },
    });

    act(() => {
      result.current.listActionsModalRef.current = {
        present: jest.fn(),
        dismiss,
      } as any;
    });

    rerender({ isSelectionMode: true });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
