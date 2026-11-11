import { useOpenDiscoverGenre } from '@/src/hooks/useOpenDiscoverGenre';
import { takeDiscoverGenreRequest } from '@/src/utils/discoverGenreIntent';
import { renderHook } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockDismissAll = jest.fn();
let mockCanDismiss = true;
let mockTab: string | null = 'home';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    dismissAll: mockDismissAll,
    canDismiss: () => mockCanDismiss,
  }),
}));
jest.mock('@/src/context/TabContext', () => ({ useCurrentTab: () => mockTab }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'l' } }));

describe('useOpenDiscoverGenre', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanDismiss = true;
    takeDiscoverGenreRequest();
  });

  it('switches to the Discover tab from another tab, handing over the genre and type', () => {
    mockTab = 'home';
    const { result } = renderHook(() => useOpenDiscoverGenre('movie'));

    result.current(27);

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/discover');
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(takeDiscoverGenreRequest()).toEqual({ mediaType: 'movie', genreId: 27 });
  });

  it("goes back to Discover's main screen from a page inside the Discover tab", () => {
    mockTab = 'discover';
    const { result } = renderHook(() => useOpenDiscoverGenre('tv'));

    result.current(10765);

    expect(mockDismissAll).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(takeDiscoverGenreRequest()).toEqual({ mediaType: 'tv', genreId: 10765 });
  });
});
