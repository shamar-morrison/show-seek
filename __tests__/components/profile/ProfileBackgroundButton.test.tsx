import { ProfileBackgroundButton } from '@/src/components/profile/ProfileBackgroundButton';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockIsAccountRequired = jest.fn();
let mockProfileBackground: {
  path: string;
  kind: 'backdrop' | 'poster';
  focus?: { x: number; y: number };
} | null = null;

jest.mock('@/src/hooks/useProfileBackground', () => ({
  useProfileBackground: () => ({ profileBackground: mockProfileBackground }),
}));
jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockIsAccountRequired,
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));

const backdrop = { path: '/backdrop.jpg', kind: 'backdrop' as const };

describe('ProfileBackgroundButton', () => {
  const onChoose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileBackground = null;
    mockIsAccountRequired.mockReturnValue(false);
  });

  const renderButton = () =>
    render(<ProfileBackgroundButton image={backdrop} onChoose={onChoose} />);
  const press = (utils: ReturnType<typeof render>) =>
    fireEvent.press(utils.getByTestId('image-lightbox-profile-background-button'));

  it('is labelled "Set as profile backdrop"', () => {
    const utils = renderButton();
    expect(utils.getByText('Set as profile backdrop')).toBeTruthy();
    expect(
      utils.getByTestId('image-lightbox-profile-background-button').props.accessibilityLabel
    ).toBe('Set as profile backdrop');
  });

  it('opens positioning for the image', () => {
    const utils = renderButton();
    press(utils);
    expect(onChoose).toHaveBeenCalledWith(backdrop);
  });

  it('starts from the saved position when it is already the backdrop', () => {
    mockProfileBackground = { ...backdrop, focus: { x: 0.2, y: 0.7 } };
    const utils = renderButton();

    press(utils);

    expect(onChoose).toHaveBeenCalledWith({ ...backdrop, focus: { x: 0.2, y: 0.7 } });
    expect(
      utils.getByTestId('image-lightbox-profile-background-button').props.accessibilityState
    ).toEqual(expect.objectContaining({ selected: true }));
  });

  it('asks guests to sign in instead', () => {
    mockIsAccountRequired.mockReturnValue(true);
    press(renderButton());
    expect(onChoose).not.toHaveBeenCalled();
  });
});
