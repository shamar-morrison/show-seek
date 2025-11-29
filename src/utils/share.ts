import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

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

  // Construct deep link
  const deepLink = `showseek://${mediaType}/${id}`;

  // Build share message
  const message = `${title} - Check this out on ShowSeek! ${deepLink}`;

  try {
    const result = await Share.share({
      message,
    });

    // Show success toast if shared (iOS provides detailed info, Android always returns sharedAction)
    if (result.action === Share.sharedAction) {
      onShowToast('Shared successfully!');
    }
    // On iOS, if user dismissed, result.action === Share.dismissedAction, no toast shown
  } catch (error) {
    // Fallback: Copy to clipboard
    try {
      await Clipboard.setStringAsync(message);
      onShowToast('Link copied to clipboard!');
    } catch (clipboardError) {
      // Last resort: show error
      onShowToast('Unable to share. Please try again.');
      console.error('Share and clipboard both failed:', error, clipboardError);
    }
  }
}
