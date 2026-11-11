import { ProfileBackdropPositioner } from '@/src/components/profile/ProfileBackdropPositioner';
import { getCoverGeometry, type ProfileBackground } from '@/src/utils/profileBackground';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@/src/components/ui/UserAvatar', () => ({ UserAvatar: () => null }));
jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { displayName: 'Sam Rivera', email: 'sam@example.com' } }),
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

const backdrop = { path: '/backdrop.jpg', kind: 'backdrop' as const };

describe('ProfileBackdropPositioner', () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  const renderPositioner = (background: ProfileBackground = backdrop) =>
    render(
      <ProfileBackdropPositioner
        background={background}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel="Save"
      />
    );
  const load = (utils: ReturnType<typeof render>, width = 1920, height = 1080) =>
    act(() => {
      utils
        .getByTestId('profile-backdrop-loading-image')
        .props.onLoad({ source: { width, height } });
    });

  it('shows the header preview with the name, a hint, and the drawer preview', () => {
    const utils = renderPositioner();

    expect(utils.getByText('Position backdrop')).toBeTruthy();
    expect(
      utils.getByText('Drag the image to choose what shows behind your profile.')
    ).toBeTruthy();
    expect(utils.getAllByText('Sam Rivera')).toHaveLength(2);
    expect(utils.getByText('Home drawer')).toBeTruthy();
  });

  it('draws the image at cover size around the chosen part once its size is known', () => {
    const utils = renderPositioner({ ...backdrop, focus: { x: 0.25, y: 0.5 } });
    load(utils);

    const g = getCoverGeometry({ width: 1920, height: 1080 }, { width: 375, height: 260 });
    const style = Object.assign(
      {},
      ...[utils.getByTestId('profile-backdrop-image').props.style].flat(Infinity)
    );
    expect(style.width).toBeCloseTo(g.width);
    expect(style.left).toBeCloseTo(-0.25 * g.overflowX);
    expect(utils.getByTestId('profile-backdrop-drawer-image')).toBeTruthy();
  });

  it('moves the chosen part as the image is dragged, and saves it', () => {
    const utils = renderPositioner();
    load(utils);
    // 1920x1080 covering the 375x260 test frame overflows by about 87px sideways, none up/down.
    const g = getCoverGeometry({ width: 1920, height: 1080 }, { width: 375, height: 260 });
    const frame = utils.getByTestId('profile-backdrop-frame');

    fireEvent(frame, 'responderGrant', {});
    fireEvent(frame, 'responderMove', { dx: -g.overflowX / 4, dy: -40 });
    fireEvent.press(utils.getByTestId('profile-backdrop-confirm'));

    // Dragging left shows more of the right; nothing to move up or down.
    expect(onConfirm).toHaveBeenCalledWith({ x: 0.75, y: 0.5 });
  });

  it('starts each drag from where the last one ended', () => {
    const utils = renderPositioner();
    load(utils);
    const g = getCoverGeometry({ width: 1920, height: 1080 }, { width: 375, height: 260 });
    const frame = utils.getByTestId('profile-backdrop-frame');

    fireEvent(frame, 'responderGrant', {});
    fireEvent(frame, 'responderMove', { dx: g.overflowX / 4, dy: 0 });
    fireEvent(frame, 'responderGrant', {});
    fireEvent(frame, 'responderMove', { dx: g.overflowX / 4, dy: 0 });
    fireEvent.press(utils.getByTestId('profile-backdrop-confirm'));

    expect(onConfirm.mock.calls[0][0].x).toBeCloseTo(0);
  });

  it('returns the starting part on Save, and cancels', () => {
    const utils = renderPositioner({ ...backdrop, focus: { x: 0.1, y: 0.9 } });

    fireEvent.press(utils.getByTestId('profile-backdrop-confirm'));
    fireEvent.press(utils.getByTestId('profile-backdrop-cancel'));

    expect(onConfirm).toHaveBeenCalledWith({ x: 0.1, y: 0.9 });
    expect(onCancel).toHaveBeenCalled();
  });

  it('puts Cancel and the confirm button side by side at the bottom', () => {
    const utils = renderPositioner();
    const footer = utils.getByTestId('profile-backdrop-footer');

    expect(footer).toHaveStyle({ flexDirection: 'row', marginTop: 'auto' });
    expect(within(footer).getByTestId('profile-backdrop-cancel')).toBeTruthy();
    // Pressable styles are functions of the pressed state.
    const confirmStyle = within(footer).getByTestId('profile-backdrop-confirm').props.style;
    const resolved = [
      typeof confirmStyle === 'function' ? confirmStyle({ pressed: false }) : confirmStyle,
    ].flat(Infinity);
    expect(Object.assign({}, ...resolved.filter(Boolean))).toEqual(
      expect.objectContaining({ backgroundColor: '#E50914' })
    );
    expect(utils.getByText('Save')).toBeTruthy();
  });

  it('starts a poster from the top', () => {
    const utils = renderPositioner({ path: '/poster.jpg', kind: 'poster' });
    fireEvent.press(utils.getByTestId('profile-backdrop-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ x: 0.5, y: 0 });
  });
});
