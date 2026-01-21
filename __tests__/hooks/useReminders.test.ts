import { useMediaReminder } from '@/src/hooks/useReminders';
import { renderHook } from '@testing-library/react-native';

// Mock the reminder service
jest.mock('@/src/services/ReminderService', () => ({
  reminderService: {
    subscribeToUserReminders: jest.fn((onData) => {
      // Call onData with mock reminders
      onData([
        {
          id: 'tv-100',
          mediaId: 100,
          mediaType: 'tv',
          title: 'Breaking Bad',
          status: 'active',
          notificationScheduledFor: Date.now() + 86400000,
        },
        {
          id: 'movie-200',
          mediaId: 200,
          mediaType: 'movie',
          title: 'Dune',
          status: 'active',
          notificationScheduledFor: Date.now() + 86400000,
        },
      ]);
      // Return unsubscribe function
      return jest.fn();
    }),
    createReminder: jest.fn(),
    cancelReminder: jest.fn(),
    updateReminder: jest.fn(),
    updateReminderDetails: jest.fn(),
  },
}));

// Mock TMDB API
jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getTVShowDetails: jest.fn(),
  },
}));

// Mock reminders data
const mockReminders = [
  {
    id: 'tv-100',
    mediaId: 100,
    mediaType: 'tv',
    title: 'Breaking Bad',
    status: 'active',
    notificationScheduledFor: Date.now() + 86400000,
  },
  {
    id: 'movie-200',
    mediaId: 200,
    mediaType: 'movie',
    title: 'Dune',
    status: 'active',
    notificationScheduledFor: Date.now() + 86400000,
  },
];

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => mockReminders),
    setQueryData: jest.fn(),
    ensureQueryData: jest.fn(),
  }),
  useQuery: jest.fn(() => ({
    data: mockReminders,
    isLoading: false,
    error: null,
  })),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isLoading: false,
    isPending: false,
  })),
}));

describe('useReminders hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useMediaReminder', () => {
    it('should return reminder for TV show with active reminder', () => {
      const { result } = renderHook(() => useMediaReminder(100, 'tv'));

      expect(result.current.hasReminder).toBe(true);
      expect(result.current.reminder).not.toBeNull();
      expect(result.current.reminder?.title).toBe('Breaking Bad');
    });

    it('should return reminder for movie with active reminder', () => {
      const { result } = renderHook(() => useMediaReminder(200, 'movie'));

      expect(result.current.hasReminder).toBe(true);
      expect(result.current.reminder).not.toBeNull();
      expect(result.current.reminder?.title).toBe('Dune');
    });

    it('should return null for media without reminder', () => {
      const { result } = renderHook(() => useMediaReminder(999, 'movie'));

      expect(result.current.hasReminder).toBe(false);
      expect(result.current.reminder).toBeNull();
    });

    it('should not match reminder if media type is different', () => {
      // Media ID 100 exists as TV, not as movie
      const { result } = renderHook(() => useMediaReminder(100, 'movie'));

      expect(result.current.hasReminder).toBe(false);
      expect(result.current.reminder).toBeNull();
    });
  });
});
