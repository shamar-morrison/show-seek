import ReviewDetailScreen from '@/src/screens/ReviewDetailScreen';
import { clearReviewQueue, setReviewQueue, type QueuedReview } from '@/src/utils/reviewQueue';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const StackScreen = () => null;
  StackScreen.displayName = 'StackScreen';
  Stack.Screen = StackScreen;

  return {
    Stack,
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      setParams: mockSetParams,
    }),
  };
});

// FlatList with initialScrollIndex renders nothing under Jest (no measured
// layout), so substitute a ref-forwarding list that renders every page.
// Pager behavior under test lives in index state + setParams, not in RN's list.
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const React = require('react');
  const MockFlatList = React.forwardRef(({ data, renderItem, testID }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: jest.fn(),
      scrollToOffset: jest.fn(),
    }));
    return React.createElement(
      RN.View,
      { testID },
      (data ?? []).map((item: any, index: number) =>
        React.createElement(
          React.Fragment,
          { key: item.id ?? index },
          renderItem({ item, index })
        )
      )
    );
  });
  MockFlatList.displayName = 'MockFlatList';
  return { ...RN, FlatList: MockFlatList };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

const makeReview = (overrides: Partial<QueuedReview> & { id: string }): QueuedReview => ({
  author: 'Author',
  author_details: { avatar_path: null, rating: 8 },
  content: `Content for ${overrides.id}`,
  created_at: '2024-05-01T12:00:00.000Z',
  updated_at: '2024-05-01T12:00:00.000Z',
  ...overrides,
});

const reviewA = makeReview({ id: 'a', author: 'Alice', likes: 12 });
const reviewB = makeReview({ id: 'b', author: 'Bob' });
const reviewC = makeReview({ id: 'c', author: 'Cara', spoiler: true, likes: 5 });

const paramsFor = (review: QueuedReview) => ({
  id: review.id,
  review: JSON.stringify(review),
});

describe('ReviewDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearReviewQueue();
    mockParams = paramsFor(reviewA);
  });

  it('renders a single review with no pager when no queue is staged', () => {
    const { queryByTestId, getByText } = render(<ReviewDetailScreen />);

    expect(getByText('Review')).toBeTruthy();
    expect(getByText('Content for a')).toBeTruthy();
    expect(queryByTestId('review-pager')).toBeNull();
    expect(queryByTestId('review-prev-button')).toBeNull();
    expect(queryByTestId('review-next-button')).toBeNull();
  });

  it('renders the pager with a counter when the entry review is in the queue', () => {
    setReviewQueue([reviewA, reviewB, reviewC]);
    mockParams = paramsFor(reviewB);

    const { getByTestId, getByText } = render(<ReviewDetailScreen />);

    expect(getByTestId('review-pager')).toBeTruthy();
    expect(getByText('Review 2 of 3')).toBeTruthy();
    expect(getByTestId('review-prev-button')).toBeTruthy();
    expect(getByTestId('review-next-button')).toBeTruthy();
  });

  it('advances to the next review and syncs params when pressing next', () => {
    setReviewQueue([reviewA, reviewB, reviewC]);
    mockParams = paramsFor(reviewA);

    const { getByTestId, getByText } = render(<ReviewDetailScreen />);

    fireEvent.press(getByTestId('review-next-button'));

    expect(getByText('Review 2 of 3')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({
      id: 'b',
      review: JSON.stringify(reviewB),
    });
  });

  it('disables the prev button on the first review and next on the last', () => {
    setReviewQueue([reviewA, reviewB]);
    mockParams = paramsFor(reviewA);

    const { getByTestId, update } = render(<ReviewDetailScreen />);

    expect(getByTestId('review-prev-button')).toBeDisabled();
    expect(getByTestId('review-next-button')).not.toBeDisabled();

    fireEvent.press(getByTestId('review-next-button'));
    update(<ReviewDetailScreen />);

    expect(getByTestId('review-next-button')).toBeDisabled();
    expect(getByTestId('review-prev-button')).not.toBeDisabled();
  });

  it('gates spoiler siblings behind tap-to-reveal until revealed', () => {
    setReviewQueue([reviewA, reviewC]);
    mockParams = paramsFor(reviewA);

    const { getByText, queryByText, getByTestId } = render(<ReviewDetailScreen />);

    // Spoiler page renders its gate instead of the body…
    expect(getByTestId('spoiler-reveal-c')).toBeTruthy();
    expect(queryByText('Content for c')).toBeNull();

    // …and reveals on tap.
    fireEvent.press(getByTestId('spoiler-reveal-c'));
    expect(getByText('Content for c')).toBeTruthy();
  });

  it('shows the entry review body even when it is flagged as a spoiler', () => {
    setReviewQueue([reviewC, reviewA]);
    mockParams = paramsFor(reviewC);

    const { getByText, queryByTestId } = render(<ReviewDetailScreen />);

    expect(getByText('Content for c')).toBeTruthy();
    expect(queryByTestId('spoiler-reveal-c')).toBeNull();
  });

  it('shows Trakt likes when positive and hides them when zero or absent', () => {
    setReviewQueue([reviewA, reviewB]);
    mockParams = paramsFor(reviewA);

    const { getByText, queryByText } = render(<ReviewDetailScreen />);

    // reviewA has 12 likes, reviewB page has none — both pages render in the pager.
    expect(getByText('12')).toBeTruthy();
    expect(queryByText('0')).toBeNull();
  });

  it('renders no pager when the entry review id is not in the queue', () => {
    setReviewQueue([reviewB, reviewC]);
    mockParams = paramsFor(reviewA);

    const { queryByTestId, getByText } = render(<ReviewDetailScreen />);

    expect(queryByTestId('review-pager')).toBeNull();
    expect(getByText('Review')).toBeTruthy();
    expect(getByText('Content for a')).toBeTruthy();
  });
});
