import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Hook to handle deep links
 */
export function useDeepLinking() {
  const router = useRouter();

  useEffect(() => {
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();
    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      const parsed = Linking.parse(url);

      const path = parsed.path || '';
      const segments = path.split('/').filter(Boolean);

      if (segments.length < 2) {
        console.warn('Invalid deep link format:', url);
        return;
      }

      const mediaType = segments[0]; // 'movie' or 'tv'
      const mediaId = segments[1]; // the ID

      if (mediaType !== 'movie' && mediaType !== 'tv') {
        console.warn('Invalid media type in deep link:', mediaType);
        return;
      }

      const route = `/(tabs)/home/${mediaType}/${mediaId}` as const;

      router.push(route);

      console.log('Deep link handled:', { mediaType, mediaId, route });
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  };
}
