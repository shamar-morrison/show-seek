import { useInAppReview } from '@/src/hooks/useInAppReview';
import { requestReviewIfEligible } from '@/src/services/reviewPromptService';
import { renderHook } from '@testing-library/react-native';

jest.mock('@/src/services/reviewPromptService', () => ({
  forceRequestReview: jest.fn(() => Promise.resolve()),
  requestReviewIfEligible: jest.fn(() => Promise.resolve('skipped')),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

describe('useInAppReview', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('checks eligibility after the delay', () => {
    renderHook(() => useInAppReview());

    jest.advanceTimersByTime(2500);

    expect(requestReviewIfEligible).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    renderHook(() => useInAppReview(false));

    jest.advanceTimersByTime(5000);

    expect(requestReviewIfEligible).not.toHaveBeenCalled();
  });

  it('starts once it becomes enabled', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useInAppReview(enabled),
      {
        initialProps: { enabled: false },
      }
    );

    rerender({ enabled: true });
    jest.advanceTimersByTime(2500);

    expect(requestReviewIfEligible).toHaveBeenCalledTimes(1);
  });
});
