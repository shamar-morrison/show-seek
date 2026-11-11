import { PreferencesSection } from '@/src/components/profile/PreferencesSection';
import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
import { renderWithProviders } from '@/__tests__/utils/test-utils';
import { fireEvent, within } from '@testing-library/react-native';
import React from 'react';

let mockDevice24Hour: boolean | undefined;
jest.mock('@/src/utils/timeFormat', () => ({
  deviceUses24HourClock: () => mockDevice24Hour,
}));

describe('PreferencesSection', () => {
  it('shows spinner only for the updating preference', () => {
    const { getAllByTestId } = renderWithProviders(
      <PreferencesSection
        preferences={DEFAULT_PREFERENCES}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={jest.fn()}
        isUpdating={true}
        updatingPreferenceKey="autoAddToWatching"
        isPremium={true}
        onPremiumPress={jest.fn()}
      />
    );

    expect(getAllByTestId('preference-spinner')).toHaveLength(1);
  });

  it('renders default bulk action preference and updates it', () => {
    const onUpdate = jest.fn();
    const { getByText, getAllByTestId, rerender } = renderWithProviders(
      <PreferencesSection
        preferences={DEFAULT_PREFERENCES}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={onUpdate}
        isUpdating={false}
        isPremium={true}
        onPremiumPress={jest.fn()}
      />
    );

    expect(getByText('Default bulk action: Move')).toBeTruthy();

    const preferenceItems = getAllByTestId('preference-item');
    const preferenceItem = preferenceItems.find((item) =>
      within(item).queryByText('Default bulk action: Move')
    );
    expect(preferenceItem).toBeTruthy();
    if (!preferenceItem) {
      throw new Error('Default bulk action preference row not found');
    }
    const bulkActionSwitch = within(preferenceItem).getByTestId('preference-switch');
    fireEvent(bulkActionSwitch, 'valueChange', true);

    expect(onUpdate).toHaveBeenCalledWith('copyInsteadOfMove', true);

    rerender(
      <PreferencesSection
        preferences={{ ...DEFAULT_PREFERENCES, copyInsteadOfMove: true }}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={onUpdate}
        isUpdating={false}
        isPremium={true}
        onPremiumPress={jest.fn()}
      />
    );

    expect(getByText('Default bulk action: Copy')).toBeTruthy();
  });

  it('renders original titles preference and updates it', () => {
    const onUpdate = jest.fn();
    const { getByText, getAllByTestId } = renderWithProviders(
      <PreferencesSection
        preferences={DEFAULT_PREFERENCES}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={onUpdate}
        isUpdating={false}
        isPremium={true}
        onPremiumPress={jest.fn()}
      />
    );

    expect(getByText('Use original titles')).toBeTruthy();

    const preferenceItems = getAllByTestId('preference-item');
    const preferenceItem = preferenceItems.find((item) =>
      within(item).queryByText('Use original titles')
    );
    expect(preferenceItem).toBeTruthy();
    if (!preferenceItem) {
      throw new Error('Use original titles preference row not found');
    }
    const originalTitleSwitch = within(preferenceItem).getByTestId('preference-switch');
    fireEvent(originalTitleSwitch, 'valueChange', true);

    expect(onUpdate).toHaveBeenCalledWith('showOriginalTitles', true);
  });

  it('renders auto-remove from should watch preference and updates it', () => {
    const onUpdate = jest.fn();
    const { getByText, getAllByTestId } = renderWithProviders(
      <PreferencesSection
        preferences={DEFAULT_PREFERENCES}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={onUpdate}
        isUpdating={false}
        isPremium={true}
        onPremiumPress={jest.fn()}
      />
    );

    expect(getByText('Auto-remove from Should Watch')).toBeTruthy();

    const preferenceItems = getAllByTestId('preference-item');
    const preferenceItem = preferenceItems.find((item) =>
      within(item).queryByText('Auto-remove from Should Watch')
    );
    expect(preferenceItem).toBeTruthy();
    if (!preferenceItem) {
      throw new Error('Auto-remove from Should Watch preference row not found');
    }
    const autoRemoveSwitch = within(preferenceItem).getByTestId('preference-switch');
    fireEvent(autoRemoveSwitch, 'valueChange', false);

    expect(onUpdate).toHaveBeenCalledWith('autoRemoveFromShouldWatch', false);
  });

  it('renders allow unreleased episode watches preference and updates it', () => {
    const onUpdate = jest.fn();
    const { getByText, getAllByTestId } = renderWithProviders(
      <PreferencesSection
        preferences={DEFAULT_PREFERENCES}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={onUpdate}
        isUpdating={false}
        isPremium={true}
        onPremiumPress={jest.fn()}
      />
    );

    expect(getByText('Allow unreleased episode watches')).toBeTruthy();

    const preferenceItems = getAllByTestId('preference-item');
    const preferenceItem = preferenceItems.find((item) =>
      within(item).queryByText('Allow unreleased episode watches')
    );
    expect(preferenceItem).toBeTruthy();
    if (!preferenceItem) {
      throw new Error('Allow unreleased episode watches preference row not found');
    }
    const allowUnreleasedSwitch = within(preferenceItem).getByTestId('preference-switch');
    fireEvent(allowUnreleasedSwitch, 'valueChange', true);

    expect(onUpdate).toHaveBeenCalledWith('allowUnreleasedEpisodeWatches', true);
  });

  it('reports content-relative offsets as root + row (mount order: rows first)', () => {
    const registerItemLayout = jest.fn();
    const { getByTestId } = renderWithProviders(
      <PreferencesSection
        preferences={DEFAULT_PREFERENCES}
        isLoading={false}
        error={null}
        onRetry={jest.fn()}
        onUpdate={jest.fn()}
        isUpdating={false}
        isPremium={true}
        onPremiumPress={jest.fn()}
        registerItemLayout={registerItemLayout}
      />
    );

    // Children lay out before parents on mount: row reports with root 0 first…
    fireEvent(getByTestId('search-item-dataSaver'), 'layout', {
      nativeEvent: { layout: { y: 800 } },
    });
    // …then the root layout corrects all known rows to absolute offsets.
    fireEvent(getByTestId('profile-preferences-root'), 'layout', {
      nativeEvent: { layout: { y: 40 } },
    });

    expect(registerItemLayout).toHaveBeenLastCalledWith('dataSaver', 840);
  });

  describe('24-hour time', () => {
    const renderWith = (use24HourTime: boolean | undefined, onUpdate = jest.fn()) => {
      const utils = renderWithProviders(
        <PreferencesSection
          preferences={{ ...DEFAULT_PREFERENCES, use24HourTime }}
          isLoading={false}
          error={null}
          onRetry={jest.fn()}
          onUpdate={onUpdate}
          isUpdating={false}
          isPremium={true}
          onPremiumPress={jest.fn()}
        />
      );
      const row = utils
        .getAllByTestId('preference-item')
        .find((item) => within(item).queryByText('24-Hour Time'));
      if (!row) throw new Error('24-Hour Time preference row not found');
      return { ...utils, toggle: within(row).getByTestId('preference-switch'), onUpdate };
    };

    afterEach(() => {
      mockDevice24Hour = undefined;
    });

    it("shows the phone's setting until the person chooses", () => {
      mockDevice24Hour = true;
      expect(renderWith(undefined).toggle.props.value).toBe(true);
      mockDevice24Hour = false;
      expect(renderWith(undefined).toggle.props.value).toBe(false);
    });

    it("shows the person's choice over the phone's setting, and saves a change", () => {
      mockDevice24Hour = true;
      const { toggle, onUpdate } = renderWith(false);
      expect(toggle.props.value).toBe(false);

      fireEvent(toggle, 'valueChange', true);
      expect(onUpdate).toHaveBeenCalledWith('use24HourTime', true);
    });
  });
});
