import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

/**
 * Hook to handle deep links from the showseek:// scheme
 * Supports:
 * - showseek://movie/{id} -> navigates to movie detail screen
 * - showseek://tv/{id} -> navigates to TV show detail screen
 */
export function useDeepLinking() {
  const router = useRouter();

  useEffect(() => {
    // Handle initial URL when app is opened from a deep link (cold start)
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    // Handle deep links when app is already running (warm start)
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();

    // Cleanup subscription
    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      // Parse the URL: showseek://movie/123 or showseek://tv/456
      const parsed = Linking.parse(url);

      // Get the path segments
      const path = parsed.path || '';
      const segments = path.split('/').filter(Boolean);

      if (segments.length < 2) {
        console.warn('Invalid deep link format:', url);
        return;
      }

      const mediaType = segments[0]; // 'movie' or 'tv'
      const mediaId = segments[1]; // the ID

      // Validate media type
      if (mediaType !== 'movie' && mediaType !== 'tv') {
        console.warn('Invalid media type in deep link:', mediaType);
        return;
      }

      // Navigate to the detail screen in the home tab
      // Using the home tab as the default entry point for deep links
      const route = `/(tabs)/home/${mediaType}/${mediaId}` as const;

      // Use replace to avoid back stack issues
      router.push(route);

      console.log('Deep link handled:', { mediaType, mediaId, route });
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  };
}
