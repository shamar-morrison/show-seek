import ShareCardScreen from '@/app/share-card';
import { setPendingShareCards } from '@/src/components/shareCard/pendingShareCards';
import { ShareCardData } from '@/src/components/shareCard/shareCardTypes';
import { useOpenShareCard } from '@/src/hooks/useOpenShareCard';
import { render, renderHook } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockEditor = jest.fn((_props: unknown) => null);
const mockStackScreen = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: (props: unknown) => mockStackScreen(props) },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));
jest.mock('@/src/components/shareCard/ShareCardEditor', () => ({
  __esModule: true,
  default: (props: unknown) => mockEditor(props),
}));

const cards: ShareCardData[] = [
  { kind: 'list', listName: '100% Wolf & "Friends"', itemCount: 2, posterPaths: [] },
];

describe('share card navigation', () => {
  it('opens the screen with the cards, unchanged by the route', () => {
    const { result } = renderHook(() => useOpenShareCard());

    result.current(cards);

    expect(mockPush).toHaveBeenCalledWith('/share-card');
    render(<ShareCardScreen />);
    expect(mockEditor).toHaveBeenCalledWith({ cards });
  });

  it('shows a titled header', () => {
    setPendingShareCards(cards);

    render(<ShareCardScreen />);

    expect(mockStackScreen).toHaveBeenCalledWith({
      options: expect.objectContaining({ headerShown: true, headerTitle: 'Share Card' }),
    });
  });

  it('leaves the screen when there is nothing to share', () => {
    setPendingShareCards([]);

    const utils = render(<ShareCardScreen />);

    expect(utils.getByTestId('redirect')).toHaveTextContent('/');
    expect(mockEditor).not.toHaveBeenCalled();
  });
});
