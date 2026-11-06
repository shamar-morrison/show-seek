import { WhatsNewSheet } from '@/src/components/WhatsNewSheet';
import type { WhatsNewAnnouncement, WhatsNewVisual } from '@/src/constants/whatsNew';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
const mockFocusCleanups: (() => void)[] = [];
let mockOnDidDismiss: (() => void) | undefined;

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const TrueSheet = React.forwardRef(
    (
      { children, onDidDismiss }: { children: React.ReactNode; onDidDismiss: () => void },
      ref: any
    ) => {
      mockOnDidDismiss = onDidDismiss;
      React.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      return children;
    }
  );
  TrueSheet.displayName = 'TrueSheet';
  return { TrueSheet };
});
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-gesture-handler', () => {
  const { Pressable, View } = require('react-native');
  return { GestureHandlerRootView: View, Pressable };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = effect();
        if (cleanup) mockFocusCleanups.push(cleanup);
        return cleanup;
      }, [effect]);
    },
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));

const iconVisual: WhatsNewVisual = { type: 'icon', icon: [] as never };
const section = (id: string, visual: WhatsNewVisual = iconVisual) => ({
  id,
  titleKey: `${id}.title`,
  descriptionKey: `${id}.description`,
  visual,
});
const announcement: WhatsNewAnnouncement = {
  id: 'test',
  sections: [
    section('one'),
    section('two', { type: 'syncLogos', source: 1 }),
    section('three', { type: 'image', source: 1 }),
  ],
};

describe('WhatsNewSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFocusCleanups.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const buttonLabel = (screen: ReturnType<typeof render>) =>
    screen.getByTestId('whats-new-button').findByType(require('react-native').Text).props.children;

  it('presents itself once its screen has settled', () => {
    render(<WhatsNewSheet announcement={announcement} onDismiss={jest.fn()} />);
    expect(mockPresent).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(600));

    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it('does not present if the user leaves the screen first', () => {
    render(<WhatsNewSheet announcement={announcement} onDismiss={jest.fn()} />);

    act(() => {
      mockFocusCleanups.forEach((cleanup) => cleanup());
      jest.advanceTimersByTime(600);
    });

    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('renders each section with its own kind of visual', () => {
    const screen = render(<WhatsNewSheet announcement={announcement} onDismiss={jest.fn()} />);

    expect(screen.getAllByTestId('whats-new-section')).toHaveLength(3);
    expect(screen.getByText('one.title')).toBeTruthy();
    expect(screen.getByText('three.description')).toBeTruthy();
    expect(screen.getAllByTestId('whats-new-icon')).toHaveLength(1);
    expect(screen.getAllByTestId('whats-new-sync-logos')).toHaveLength(1);
    expect(screen.getAllByTestId('whats-new-image')).toHaveLength(1);
  });

  it('steps through the sections, then dismisses on the last one', () => {
    const screen = render(<WhatsNewSheet announcement={announcement} onDismiss={jest.fn()} />);
    expect(buttonLabel(screen)).toBe('common.next');

    fireEvent.press(screen.getByTestId('whats-new-button'));
    expect(buttonLabel(screen)).toBe('common.next');

    fireEvent.press(screen.getByTestId('whats-new-button'));
    expect(buttonLabel(screen)).toBe('common.done');
    expect(mockDismiss).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('whats-new-button'));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('follows swipes', () => {
    const screen = render(<WhatsNewSheet announcement={announcement} onDismiss={jest.fn()} />);
    const { width } = Dimensions.get('window');

    fireEvent(screen.getByTestId('whats-new-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: width * 2, y: 0 } },
    });

    expect(buttonLabel(screen)).toBe('common.done');
  });

  it('reports a dismissal however the sheet was closed', () => {
    const onDismiss = jest.fn();
    render(<WhatsNewSheet announcement={announcement} onDismiss={onDismiss} />);

    act(() => mockOnDidDismiss?.());

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hides the dots and goes straight to done for a single section', () => {
    const screen = render(
      <WhatsNewSheet
        announcement={{ id: 'one', sections: [section('one')] }}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.queryByTestId('whats-new-dot-0')).toBeNull();
    expect(buttonLabel(screen)).toBe('common.done');
  });
});
