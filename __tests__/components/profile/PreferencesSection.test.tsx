import { PreferencesSection } from '@/src/components/profile/PreferencesSection';
import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
import { renderWithProviders } from '@/__tests__/utils/test-utils';
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
});
