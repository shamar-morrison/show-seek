import ShareCardEditor from '@/src/components/shareCard/ShareCardEditor';
import {
  EpisodeShareCardData,
  ListShareCardData,
  ProgressShareCardData,
  ShareCardData,
  TitleShareCardData,
} from '@/src/components/shareCard/shareCardTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, configure, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Keyboard, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';

jest.mock('@hugeicons/react-native', () => ({ HugeiconsIcon: () => null }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file:///card.png')),
}));
jest.mock('@/src/components/ui/Toast', () => ({
  __esModule: true,
  default: () => null,
}));

// The capture copy is hidden from screen readers, but it is what gets exported.
configure({ defaultIncludeHiddenElements: true });

const mockAuth = {
  user: { displayName: 'Sam Rivera', photoURL: null as string | null, email: 'sam@example.com' },
  isGuest: false,
};
jest.mock('@/src/context/auth', () => ({ useAuth: () => mockAuth }));

const movie: TitleShareCardData = {
  kind: 'title',
  title: 'Test Movie',
  posterPath: '/poster.jpg',
  backdropPath: '/backdrop.jpg',
  releaseYear: '2024',
  genres: ['Drama', 'Mystery', 'Sci-Fi'],
  userRating: 0,
};

const renderEditor = async (data: ShareCardData = movie) => {
  const utils = render(<ShareCardEditor visible onClose={jest.fn()} cards={[data]} />);
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  await act(async () => {});
  return utils;
};

const capturedCard = (utils: ReturnType<typeof render>) =>
  within(utils.getByTestId('share-card-capture'));

const captureImages = (utils: ReturnType<typeof render>) =>
  capturedCard(utils).UNSAFE_getAllByType('Image' as unknown as React.ComponentType);

const settleCaptureImages = (utils: ReturnType<typeof render>) => {
  act(() => {
    captureImages(utils).forEach((image) => image.props.onLoadEnd());
  });
};

const isDisabled = (utils: ReturnType<typeof render>, testID: string) =>
  utils.getByTestId(testID).props.accessibilityState?.disabled === true;

describe('ShareCardEditor', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockAuth.user = { displayName: 'Sam Rivera', photoURL: null, email: 'sam@example.com' };
    mockAuth.isGuest = false;
  });

  it('waits for card images before allowing share or save', async () => {
    const utils = await renderEditor();
    expect(isDisabled(utils, 'share-card-share')).toBe(true);
    expect(isDisabled(utils, 'share-card-save')).toBe(true);

    settleCaptureImages(utils);

    expect(isDisabled(utils, 'share-card-share')).toBe(false);
    expect(isDisabled(utils, 'share-card-save')).toBe(false);
  });

  it('counts a failed image as settled so sharing is not blocked', async () => {
    const utils = await renderEditor({ ...movie, backdropPath: null, posterPath: null });
    settleCaptureImages(utils);

    expect(isDisabled(utils, 'share-card-share')).toBe(false);
  });

  it('allows capture after the timeout when an image never finishes', async () => {
    jest.useFakeTimers();
    try {
      const utils = render(<ShareCardEditor visible onClose={jest.fn()} cards={[movie]} />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5999);
      });
      expect(isDisabled(utils, 'share-card-share')).toBe(true);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(isDisabled(utils, 'share-card-share')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['portrait', { width: 1080, height: 1920 }],
    ['square', { width: 1080, height: 1080 }],
    ['landscape', { width: 1920, height: 1080 }],
  ])('captures %s at its export size', async (format, size) => {
    const utils = await renderEditor();
    fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));
    settleCaptureImages(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('share-card-save'));
    });

    expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(size));
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///card.png');
  });

  it('waits for images again after switching size', async () => {
    const utils = await renderEditor();
    settleCaptureImages(utils);
    expect(isDisabled(utils, 'share-card-share')).toBe(false);

    fireEvent.press(utils.getByTestId('share-card-format-tab-landscape'));

    expect(isDisabled(utils, 'share-card-share')).toBe(true);
  });

  it('stays open after sharing so another size can be exported', async () => {
    const onClose = jest.fn();
    const utils = render(<ShareCardEditor visible onClose={onClose} cards={[movie]} />);
    await act(async () => {});
    settleCaptureImages(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('share-card-share'));
    });

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///card.png',
      expect.objectContaining({ mimeType: 'image/png' })
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not capture when the gallery permission is denied', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });
    const utils = await renderEditor();
    settleCaptureImages(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId('share-card-save'));
    });

    expect(captureRef).not.toHaveBeenCalled();
    expect(isDisabled(utils, 'share-card-save')).toBe(false);
  });

  describe('identity', () => {
    it('shows the name by default and never the email', async () => {
      const utils = await renderEditor();

      expect(capturedCard(utils).getByText('Sam Rivera')).toBeTruthy();
      expect(capturedCard(utils).queryByText('sam@example.com')).toBeNull();
    });

    it('removes the name and photo when hidden, and remembers the choice', async () => {
      mockAuth.user = {
        displayName: 'Sam Rivera',
        photoURL: 'https://example.com/me.jpg',
        email: 'sam@example.com',
      };
      const utils = await renderEditor();

      fireEvent(utils.getByTestId('preference-switch'), 'valueChange', false);

      expect(capturedCard(utils).queryByTestId('share-card-identity')).toBeNull();
      expect(capturedCard(utils).getByText('ShowSeek')).toBeTruthy();
      await waitFor(async () =>
        expect(JSON.parse((await AsyncStorage.getItem('shareCardPreferences'))!)).toEqual(
          expect.objectContaining({ showIdentity: false })
        )
      );

      utils.unmount();
      const reopened = await renderEditor();
      expect(capturedCard(reopened).queryByTestId('share-card-identity')).toBeNull();
    });

    it('offers no identity or toggle to guests', async () => {
      mockAuth.isGuest = true;
      mockAuth.user = { displayName: 'Guest', photoURL: null, email: '' };
      const utils = await renderEditor();

      expect(utils.queryByTestId('preference-switch')).toBeNull();
      expect(capturedCard(utils).queryByTestId('share-card-identity')).toBeNull();
    });

    it('offers no toggle when there is no name or photo, even with an email', async () => {
      mockAuth.user = { displayName: '  ', photoURL: null, email: 'sam@example.com' };
      const utils = await renderEditor();

      expect(utils.queryByTestId('preference-switch')).toBeNull();
      expect(capturedCard(utils).queryByTestId('share-card-identity')).toBeNull();
    });

    it('waits for the profile photo before capture', async () => {
      mockAuth.user = {
        displayName: 'Sam Rivera',
        photoURL: 'https://example.com/me.jpg',
        email: '',
      };
      const utils = await renderEditor();
      const images = captureImages(utils);
      const photo = images.find((image) => image.props.source?.uri?.includes('me.jpg'))!;

      act(() => {
        images.filter((image) => image !== photo).forEach((image) => image.props.onLoadEnd());
      });
      expect(isDisabled(utils, 'share-card-share')).toBe(true);

      act(() => photo.props.onLoadEnd());
      expect(isDisabled(utils, 'share-card-share')).toBe(false);
    });
  });

  describe('title card content', () => {
    const selectFormat = (utils: ReturnType<typeof render>, format: string) =>
      fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));

    const stats = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).queryAllByTestId('share-card-stat');

    const foregroundUri = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).getByTestId('share-card-foreground').props.source.uri;

    const blurredUri = (utils: ReturnType<typeof render>) =>
      captureImages(utils).find((image) => image.props.blurRadius)?.props.source.uri;

    it.each(['portrait', 'square', 'landscape'])('%s shows no media type', async (format) => {
      const utils = await renderEditor();
      selectFormat(utils, format);

      expect(capturedCard(utils).queryByText('Movie')).toBeNull();
      expect(capturedCard(utils).queryByText('TV Show')).toBeNull();
    });

    it.each(['portrait', 'square', 'landscape'])('%s has no stats until rated', async (format) => {
      const utils = await renderEditor();
      selectFormat(utils, format);

      expect(stats(utils)).toHaveLength(0);
    });

    it.each(['portrait', 'square', 'landscape'])(
      '%s shows only the rating on a rated movie',
      async (format) => {
        const utils = await renderEditor({ ...movie, userRating: 8.5 });
        selectFormat(utils, format);

        expect(capturedCard(utils).getByText('8.5/10')).toBeTruthy();
        expect(stats(utils)).toHaveLength(1);
      }
    );

    it.each(['portrait', 'square', 'landscape'])('%s shows the website', async (format) => {
      const utils = await renderEditor();
      selectFormat(utils, format);

      expect(capturedCard(utils).getByText('show-seek.app')).toBeTruthy();
    });

    it('portrait blurs the poster behind a sharp copy of it', async () => {
      const utils = await renderEditor();
      selectFormat(utils, 'portrait');

      expect(blurredUri(utils)).toContain('/poster.jpg');
      expect(foregroundUri(utils)).toContain('/poster.jpg');
    });

    it('square blurs the backdrop behind a sharp copy of it', async () => {
      const utils = await renderEditor();
      selectFormat(utils, 'square');

      expect(blurredUri(utils)).toContain('/backdrop.jpg');
      expect(foregroundUri(utils)).toContain('/backdrop.jpg');
    });

    it('square falls back to the poster when there is no backdrop', async () => {
      const utils = await renderEditor({ ...movie, backdropPath: null });
      selectFormat(utils, 'square');

      expect(foregroundUri(utils)).toContain('/poster.jpg');
      expect(
        capturedCard(utils).getByTestId('share-card-foreground-frame').props.style[1].aspectRatio
      ).toBeCloseTo(2 / 3);
    });

    it('landscape keeps its poster over a blurred backdrop', async () => {
      const utils = await renderEditor();
      selectFormat(utils, 'landscape');

      expect(blurredUri(utils)).toContain('/backdrop.jpg');
      expect(foregroundUri(utils)).toContain('/poster.jpg');
    });

    it('limits genres to two', async () => {
      const utils = await renderEditor();

      expect(capturedCard(utils).getByText('2024 • Drama, Mystery')).toBeTruthy();
    });
  });

  describe('note', () => {
    const input = (utils: ReturnType<typeof render>) => utils.getByTestId('share-card-note-input');
    const cardNote = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).queryByTestId('share-card-note');

    it('shows no note on the card until one is typed', async () => {
      const utils = await renderEditor();

      expect(cardNote(utils)).toBeNull();
    });

    it.each(['portrait', 'square', 'landscape'])('%s shows the note in quotes', async (format) => {
      const utils = await renderEditor();
      fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));
      fireEvent.changeText(input(utils), 'Best finale ever');

      expect(cardNote(utils)).toHaveTextContent('\u201CBest finale ever\u201D');
    });

    it.each([
      ['portrait', 64],
      ['square', 40],
      ['landscape', 56],
    ])('%s sets the note in bold italic with room above it', async (format, marginTop) => {
      const utils = await renderEditor();
      fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));
      fireEvent.changeText(input(utils), 'Best finale ever');

      expect(cardNote(utils)).toHaveStyle({
        fontFamily: 'Inter_700Bold_Italic',
        marginTop,
      });
    });

    it('limits the note to 150 characters and shows the count', async () => {
      const utils = await renderEditor();
      fireEvent.changeText(input(utils), 'abc');

      expect(input(utils).props.maxLength).toBe(150);
      expect(utils.getByTestId('share-card-note-count')).toHaveTextContent('3/150');
    });

    it('ignores a note that is only whitespace', async () => {
      const utils = await renderEditor();
      fireEvent.changeText(input(utils), '   \n  ');

      expect(cardNote(utils)).toBeNull();
    });

    it('flattens pasted line breaks', async () => {
      const utils = await renderEditor();
      fireEvent.changeText(input(utils), ' So\n\ngood ');

      expect(cardNote(utils)).toHaveTextContent('\u201CSo good\u201D');
    });

    it('leaves the middle image at full size, shrinking only if content overflows', async () => {
      const utils = await renderEditor();
      const frameStyle = () =>
        capturedCard(utils).getByTestId('share-card-foreground-frame').props.style;
      const before = frameStyle()[1];

      fireEvent.changeText(input(utils), 'Worth it');

      expect(frameStyle()[1]).toEqual(before);
      expect(before.height).toBe(840);
      expect(before.aspectRatio).toBeCloseTo(2 / 3);
      expect(frameStyle()[0].flexShrink).toBe(1);
    });

    it('hides the other controls while typing', async () => {
      const utils = await renderEditor();

      fireEvent(input(utils), 'focus');
      expect(utils.queryByTestId('share-card-share')).toBeNull();
      expect(utils.queryByTestId('share-card-format')).toBeNull();

      fireEvent(input(utils), 'blur');
      expect(utils.getByTestId('share-card-share')).toBeTruthy();
      expect(utils.getByTestId('share-card-format')).toBeTruthy();
    });

    it('brings the controls back when the keyboard closes without a blur', async () => {
      const utils = await renderEditor();
      fireEvent(input(utils), 'focus');
      expect(utils.queryByTestId('share-card-share')).toBeNull();

      const [event, onHide] = (Keyboard.addListener as jest.Mock).mock.calls.at(-1);
      expect(event).toBe('keyboardDidHide');
      act(() => onHide());

      expect(utils.getByTestId('share-card-share')).toBeTruthy();
    });

    it('is a single line with a whole field that can be tapped', async () => {
      const utils = await renderEditor();

      expect(input(utils).props.multiline).toBeFalsy();
      expect(utils.getByTestId('share-card-note-field').props.onPress).toEqual(
        expect.any(Function)
      );
      expect(input(utils).props.placeholder).toBe('Add a note');
    });

    describe('keyboard on Android', () => {
      const originalOS = Platform.OS;
      const keyboardListener = (name: string) =>
        (Keyboard.addListener as jest.Mock).mock.calls
          .filter(([event]) => event === name)
          .at(-1)![1];
      const bottomPadding = (utils: ReturnType<typeof render>) =>
        utils.getByTestId('share-card-screen').props.style[1].paddingBottom;

      beforeEach(() => {
        (Platform as { OS: string }).OS = 'android';
      });

      afterEach(() => {
        (Platform as { OS: string }).OS = originalOS;
      });

      const renderWithHeight = async () => {
        const utils = await renderEditor();
        fireEvent(utils.getByTestId('share-card-screen'), 'layout', {
          nativeEvent: { layout: { height: 800 } },
        });
        return utils;
      };

      it('lifts the screen above the keyboard', async () => {
        const utils = await renderWithHeight();

        act(() => keyboardListener('keyboardDidShow')({ endCoordinates: { screenY: 500 } }));

        expect(bottomPadding(utils)).toBe(308);
      });

      it('returns to its resting padding when the keyboard closes', async () => {
        const utils = await renderWithHeight();
        const before = bottomPadding(utils);

        act(() => keyboardListener('keyboardDidShow')({ endCoordinates: { screenY: 500 } }));
        // Android reports a different measurement on hide, which must not be treated as a keyboard.
        act(() => keyboardListener('keyboardDidHide')({ endCoordinates: { screenY: 760 } }));

        expect(bottomPadding(utils)).toBe(before);
      });

      it('does not let the keyboard avoiding view adjust the layout', async () => {
        const utils = await renderEditor();
        const avoider = utils.UNSAFE_getByType(
          'KeyboardAvoidingView' as unknown as React.ComponentType
        );

        expect(avoider.props.behavior).toBeUndefined();
      });
    });

    it('uses padding keyboard avoidance on iOS and no manual keyboard listener', async () => {
      const utils = await renderEditor();
      const avoider = utils.UNSAFE_getByType(
        'KeyboardAvoidingView' as unknown as React.ComponentType
      );

      expect(avoider.props.behavior).toBe('padding');
      expect(Keyboard.addListener).not.toHaveBeenCalledWith('keyboardDidShow', expect.anything());
    });

    it('keeps the note after sharing', async () => {
      const utils = await renderEditor();
      settleCaptureImages(utils);
      fireEvent.changeText(input(utils), 'Keep me');

      await act(async () => {
        fireEvent.press(utils.getByTestId('share-card-share'));
      });

      expect(cardNote(utils)).toHaveTextContent('\u201CKeep me\u201D');
    });
  });

  describe('episode card', () => {
    const episode: EpisodeShareCardData = {
      kind: 'episode',
      showTitle: 'Test Show',
      episodeTitle: 'The Pilot',
      seasonNumber: 4,
      episodeNumber: 9,
      posterPath: '/poster.jpg',
      stillPath: '/still.jpg',
      backdropPath: '/backdrop.jpg',
      runtimeMinutes: 143,
      userRating: 0,
    };

    const selectFormat = (utils: ReturnType<typeof render>, format: string) =>
      fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));
    const headline = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).getByTestId('share-card-title');
    const foregroundUri = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).getByTestId('share-card-foreground').props.source.uri;

    it.each(['portrait', 'square', 'landscape'])(
      '%s puts the capitalized show above the episode title and number',
      async (format) => {
        const utils = await renderEditor(episode);
        selectFormat(utils, format);

        const eyebrow = capturedCard(utils).getByTestId('share-card-eyebrow');
        expect(eyebrow).toHaveTextContent('Test Show');
        expect(eyebrow).toHaveStyle({ textTransform: 'uppercase' });
        expect(headline(utils)).toHaveTextContent('The Pilot');
        expect(capturedCard(utils).getByText('S04 | E9 · 2h 23m')).toBeTruthy();
      }
    );

    it('leaves the padding off double-digit seasons', async () => {
      const utils = await renderEditor({ ...episode, seasonNumber: 12, runtimeMinutes: 45 });

      expect(capturedCard(utils).getByText('S12 | E9 · 45m')).toBeTruthy();
    });

    it('shows whole hours without minutes', async () => {
      const utils = await renderEditor({ ...episode, runtimeMinutes: 60 });

      expect(capturedCard(utils).getByText('S04 | E9 · 1h')).toBeTruthy();
    });

    it('drops the runtime when the episode has none', async () => {
      const utils = await renderEditor({ ...episode, runtimeMinutes: null });

      expect(capturedCard(utils).getByText('S04 | E9')).toBeTruthy();
    });

    it('offers no headline switch, since the title and number both show', async () => {
      const utils = await renderEditor(episode);

      expect(utils.queryByTestId('share-card-episode-headline')).toBeNull();
    });

    it('has no capitalized line on movies and shows', async () => {
      const utils = await renderEditor();

      expect(capturedCard(utils).queryByTestId('share-card-eyebrow')).toBeNull();
    });

    it('shows the episode rating only once rated', async () => {
      const unrated = await renderEditor(episode);
      expect(capturedCard(unrated).queryAllByTestId('share-card-stat')).toHaveLength(0);
      unrated.unmount();

      const rated = await renderEditor({ ...episode, userRating: 9 });
      expect(capturedCard(rated).getByText('9/10')).toBeTruthy();
    });

    it('shows the note', async () => {
      const utils = await renderEditor(episode);
      fireEvent.changeText(utils.getByTestId('share-card-note-input'), 'What a finale');

      expect(capturedCard(utils).getByTestId('share-card-note')).toHaveTextContent(
        '\u201CWhat a finale\u201D'
      );
    });

    it('uses the poster in portrait and landscape, and the still in square', async () => {
      const utils = await renderEditor(episode);
      expect(foregroundUri(utils)).toContain('/poster.jpg');

      selectFormat(utils, 'square');
      expect(foregroundUri(utils)).toContain('/still.jpg');

      selectFormat(utils, 'landscape');
      expect(foregroundUri(utils)).toContain('/poster.jpg');
    });

    it('falls back to the show backdrop when the episode has no still', async () => {
      const utils = await renderEditor({ ...episode, stillPath: null });
      selectFormat(utils, 'square');

      expect(foregroundUri(utils)).toContain('/backdrop.jpg');
    });

    it('captures at the chosen size', async () => {
      const utils = await renderEditor(episode);
      selectFormat(utils, 'landscape');
      settleCaptureImages(utils);

      await act(async () => {
        fireEvent.press(utils.getByTestId('share-card-save'));
      });

      expect(captureRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ width: 1920, height: 1080 })
      );
    });
  });

  describe('progress card', () => {
    const progress: ProgressShareCardData = {
      kind: 'progress',
      showTitle: 'Test Show',
      seasonTitle: 'Season 4',
      seasonYear: '2022',
      watchedCount: 8,
      totalCount: 9,
      userRating: 0,
      posterPath: '/season-poster.jpg',
      backdropPath: '/backdrop.jpg',
    };

    const selectFormat = (utils: ReturnType<typeof render>, format: string) =>
      fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));
    const fill = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).getByTestId('share-card-progress-fill');

    it.each(['portrait', 'square', 'landscape'])(
      '%s shows the show, season, year and progress',
      async (format) => {
        const utils = await renderEditor(progress);
        selectFormat(utils, format);

        expect(capturedCard(utils).getByTestId('share-card-eyebrow')).toHaveTextContent(
          'Test Show'
        );
        expect(capturedCard(utils).getByTestId('share-card-title')).toHaveTextContent('Season 4');
        expect(capturedCard(utils).getByText('2022')).toBeTruthy();
        expect(capturedCard(utils).getByText('8/9')).toBeTruthy();
        expect(fill(utils)).toHaveStyle({ width: `${(8 / 9) * 100}%` });
      }
    );

    it('shows the season rating only once rated', async () => {
      const unrated = await renderEditor(progress);
      expect(capturedCard(unrated).queryAllByTestId('share-card-stat')).toHaveLength(0);
      unrated.unmount();

      const rated = await renderEditor({ ...progress, userRating: 8.5 });
      expect(capturedCard(rated).getByText('8.5/10')).toBeTruthy();
      expect(capturedCard(rated).getByText('8/9')).toBeTruthy();
    });

    it('fills the bar for a finished season', async () => {
      const utils = await renderEditor({ ...progress, watchedCount: 9 });

      expect(fill(utils)).toHaveStyle({ width: '100%' });
    });

    it('never overfills or divides by zero', async () => {
      const over = await renderEditor({ ...progress, watchedCount: 12 });
      expect(fill(over)).toHaveStyle({ width: '100%' });
      over.unmount();

      const empty = await renderEditor({ ...progress, watchedCount: 0, totalCount: 0 });
      expect(fill(empty)).toHaveStyle({ width: '0%' });
    });

    it('shows no progress bar on other cards', async () => {
      const utils = await renderEditor();

      expect(capturedCard(utils).queryByTestId('share-card-progress')).toBeNull();
    });

    it('supports the note', async () => {
      const utils = await renderEditor(progress);
      fireEvent.changeText(utils.getByTestId('share-card-note-input'), 'Almost done');

      expect(capturedCard(utils).getByTestId('share-card-note')).toHaveTextContent(
        '\u201CAlmost done\u201D'
      );
    });
  });

  describe('list card', () => {
    const list: ListShareCardData = {
      kind: 'list',
      listName: 'Comfort Shows',
      itemCount: 24,
      posterPaths: ['/one.jpg', '/two.jpg', '/three.jpg'],
    };

    const selectFormat = (utils: ReturnType<typeof render>, format: string) =>
      fireEvent.press(utils.getByTestId(`share-card-format-tab-${format}`));
    const fanPosters = (utils: ReturnType<typeof render>) =>
      capturedCard(utils).queryAllByTestId('share-card-fan-poster');
    const posterUris = (utils: ReturnType<typeof render>) =>
      fanPosters(utils).map((poster) => poster.findByType('Image' as never).props.source.uri);

    it.each(['portrait', 'square', 'landscape'])(
      '%s shows the list name, count and a fan of posters',
      async (format) => {
        const utils = await renderEditor(list);
        selectFormat(utils, format);

        expect(capturedCard(utils).getByTestId('share-card-title')).toHaveTextContent(
          'Comfort Shows'
        );
        expect(capturedCard(utils).getByText('24 items')).toBeTruthy();
        expect(fanPosters(utils)).toHaveLength(3);
        expect(capturedCard(utils).queryByTestId('share-card-foreground')).toBeNull();
      }
    );

    it('draws the first poster last so it sits in front', async () => {
      const utils = await renderEditor(list);

      expect(posterUris(utils).at(-1)).toContain('/one.jpg');
    });

    it('uses a singular count for one item', async () => {
      const utils = await renderEditor({ ...list, itemCount: 1, posterPaths: ['/one.jpg'] });

      expect(capturedCard(utils).getByText('1 item')).toBeTruthy();
    });

    it('shows one poster normally instead of a fan', async () => {
      const utils = await renderEditor({ ...list, itemCount: 1, posterPaths: ['/one.jpg'] });

      expect(capturedCard(utils).queryByTestId('share-card-fan')).toBeNull();
      expect(capturedCard(utils).getByTestId('share-card-foreground').props.source.uri).toContain(
        '/one.jpg'
      );
    });

    it('fans out two posters', async () => {
      const utils = await renderEditor({
        ...list,
        itemCount: 2,
        posterPaths: ['/one.jpg', '/two.jpg'],
      });

      expect(fanPosters(utils)).toHaveLength(2);
    });

    it('still renders with no posters at all', async () => {
      const utils = await renderEditor({ ...list, itemCount: 2, posterPaths: [] });

      expect(capturedCard(utils).queryByTestId('share-card-fan')).toBeNull();
      expect(capturedCard(utils).queryByTestId('share-card-foreground')).toBeNull();
      expect(capturedCard(utils).getByTestId('share-card-title')).toHaveTextContent(
        'Comfort Shows'
      );
    });

    it('waits for every fanned poster before capture', async () => {
      const utils = await renderEditor(list);
      const images = captureImages(utils);
      const lastPoster = images.find((image) => image.props.source?.uri?.includes('/three.jpg'))!;

      act(() => {
        images.filter((image) => image !== lastPoster).forEach((image) => image.props.onLoadEnd());
      });
      expect(isDisabled(utils, 'share-card-share')).toBe(true);

      act(() => lastPoster.props.onLoadEnd());
      expect(isDisabled(utils, 'share-card-share')).toBe(false);
    });

    it('supports the note and hiding the profile', async () => {
      const utils = await renderEditor(list);
      fireEvent.changeText(utils.getByTestId('share-card-note-input'), 'My favorites');
      fireEvent(utils.getByTestId('preference-switch'), 'valueChange', false);

      expect(capturedCard(utils).getByTestId('share-card-note')).toHaveTextContent(
        '\u201CMy favorites\u201D'
      );
      expect(capturedCard(utils).queryByTestId('share-card-identity')).toBeNull();
    });
  });

  describe('card picker', () => {
    const episodeCard: EpisodeShareCardData = {
      kind: 'episode',
      showTitle: 'Test Show',
      episodeTitle: 'The Pilot',
      seasonNumber: 1,
      episodeNumber: 1,
      posterPath: '/poster.jpg',
      stillPath: '/still.jpg',
      backdropPath: '/backdrop.jpg',
      runtimeMinutes: 45,
      userRating: 0,
    };
    const progressCard: ProgressShareCardData = {
      kind: 'progress',
      showTitle: 'Test Show',
      seasonTitle: 'Season 1',
      seasonYear: '2020',
      watchedCount: 1,
      totalCount: 8,
      userRating: 0,
      posterPath: '/poster.jpg',
      backdropPath: '/backdrop.jpg',
    };

    const renderBoth = async () => {
      const utils = render(
        <ShareCardEditor visible onClose={jest.fn()} cards={[episodeCard, progressCard]} />
      );
      await act(async () => {});
      return utils;
    };

    it('is hidden when there is only one card', async () => {
      const utils = await renderEditor();

      expect(utils.queryByTestId('share-card-kind')).toBeNull();
    });

    it('opens on the first card and switches to the other', async () => {
      const utils = await renderBoth();
      expect(capturedCard(utils).getByTestId('share-card-title')).toHaveTextContent('The Pilot');

      fireEvent.press(utils.getByTestId('share-card-kind-tab-progress'));

      expect(capturedCard(utils).getByTestId('share-card-title')).toHaveTextContent('Season 1');
      expect(
        within(utils.getByTestId('share-card-kind-tab-progress')).getByText('Progress')
      ).toBeTruthy();
    });

    it('waits for images again after switching', async () => {
      const utils = await renderBoth();
      settleCaptureImages(utils);
      expect(isDisabled(utils, 'share-card-share')).toBe(false);

      fireEvent.press(utils.getByTestId('share-card-kind-tab-progress'));

      expect(isDisabled(utils, 'share-card-share')).toBe(true);
    });

    it('keeps the note when switching', async () => {
      const utils = await renderBoth();
      fireEvent.changeText(utils.getByTestId('share-card-note-input'), 'Hooked');

      fireEvent.press(utils.getByTestId('share-card-kind-tab-progress'));

      expect(capturedCard(utils).getByTestId('share-card-note')).toHaveTextContent(
        '\u201CHooked\u201D'
      );
    });
  });

  it('labels the actions Share and Save', async () => {
    const utils = await renderEditor();
    settleCaptureImages(utils);

    expect(within(utils.getByTestId('share-card-share')).getByText('Share')).toBeTruthy();
    expect(within(utils.getByTestId('share-card-save')).getByText('Save')).toBeTruthy();
  });

  it('scales the preview to fit the available space', async () => {
    const utils = await renderEditor();
    expect(utils.queryByTestId('share-card-preview')).toBeNull();

    fireEvent(utils.getByTestId('share-card-stage'), 'layout', {
      nativeEvent: { layout: { width: 342, height: 480 } },
    });

    const previewStyle = utils.getByTestId('share-card-preview').props.style[1];
    expect(previewStyle.height).toBeCloseTo(480);
    expect(previewStyle.width).toBeCloseTo(270);
  });
});
