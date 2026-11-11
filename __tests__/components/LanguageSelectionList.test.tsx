import { LanguageSelectionList } from '@/src/components/language/LanguageSelectionList';
import { SUPPORTED_LANGUAGES } from '@/src/constants/supportedLanguages';
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'l' } }));

const renderList = (query?: string) =>
  render(
    <LanguageSelectionList
      selectedLanguage="en-US"
      accentColor="#E50914"
      errorTitle="Error"
      errorMessage="Failed"
      onSelectLanguage={jest.fn()}
      query={query}
      emptyText="No results found"
    />
  );

describe('LanguageSelectionList search', () => {
  it('shows every language without a query (onboarding)', () => {
    expect(renderList().getAllByTestId(/^language-option-/)).toHaveLength(
      SUPPORTED_LANGUAGES.length
    );
  });

  it('shows only matching languages', () => {
    const ids = renderList('german')
      .getAllByTestId(/^language-option-/)
      .map((node) => node.props.testID);
    expect(ids).toEqual(['language-option-de-DE']);
  });

  it('says so when nothing matches', () => {
    const utils = renderList('klingon');
    expect(utils.queryAllByTestId(/^language-option-/)).toHaveLength(0);
    expect(utils.getByText('No results found')).toBeTruthy();
  });
});
