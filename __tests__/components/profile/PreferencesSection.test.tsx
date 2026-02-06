import { PreferencesSection } from '@/src/components/profile/PreferencesSection';
import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
import { renderWithProviders } from '@/__tests__/utils/test-utils';
import { fireEvent } from '@testing-library/react-native';
import React from 'react';

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

    const switches = getAllByTestId('preference-switch');
    fireEvent(switches[3], 'valueChange', true);

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
});
