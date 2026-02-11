import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';

describe('getDisplayMediaTitle', () => {
  it('prefers localized title when preferOriginal is false', () => {
    const title = getDisplayMediaTitle(
      {
        title: 'Spirited Away',
        original_title: 'Sen to Chihiro no Kamikakushi',
      },
      false
    );

    expect(title).toBe('Spirited Away');
  });

  it('prefers original title when preferOriginal is true', () => {
    const title = getDisplayMediaTitle(
      {
        name: 'Money Heist',
        original_name: 'La casa de papel',
      },
      true
    );

    expect(title).toBe('La casa de papel');
  });

  it('falls back to alternate title set when preferred values are missing', () => {
    const localizedFallback = getDisplayMediaTitle(
      {
        original_title: 'Cidade de Deus',
      },
      false
    );
    const originalFallback = getDisplayMediaTitle(
      {
        title: 'City of God',
      },
      true
    );

    expect(localizedFallback).toBe('Cidade de Deus');
    expect(originalFallback).toBe('City of God');
  });

  it('returns empty string when no title values exist', () => {
    const title = getDisplayMediaTitle(
      {
        title: '   ',
        name: '',
        original_title: '   ',
        original_name: '',
      },
      true
    );

    expect(title).toBe('');
  });
});
