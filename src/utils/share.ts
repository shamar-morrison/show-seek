import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import i18n from '@/src/i18n';

export interface ShareMediaOptions {
  id: number;
  title: string;
  mediaType: 'movie' | 'tv';
}

/**
 * Share a movie or TV show with a deep link
 * Falls back to clipboard if Share API fails
 */
export async function shareMedia(
  options: ShareMediaOptions,
  onShowToast: (message: string) => void
): Promise<void> {
  const { id, title, mediaType } = options;

  const tmdbUrl = `https://www.themoviedb.org/${mediaType}/${id}`;
  const message = i18n.t('share.message', { title, url: tmdbUrl });

  try {
    await Share.share({
      message,
    });
  } catch (error) {
    try {
      await Clipboard.setStringAsync(message);
      onShowToast(i18n.t('share.linkCopied'));
    } catch (clipboardError) {
      onShowToast(i18n.t('share.unableToShare'));
      console.error('Share and clipboard both failed:', error, clipboardError);
    }
  }
}
