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

      const rawSegments = (parsed.path || '').split('/').filter(Boolean);
      // For custom-scheme URLs (showseek://library/...) the first section
      // lands in `hostname`, not `path` — fold it back so routing sees the
      // full path. Web (http/https) URLs keep hostname separate.
      const segments = [
        ...(parsed.hostname && parsed.scheme !== 'http' && parsed.scheme !== 'https'
          ? [parsed.hostname]
          : []),
        ...rawSegments,
      ];

      if (segments.length < 1) {
        console.warn('Invalid deep link format:', url);
        return;
      }

      const [first, second, third] = segments;

      // showseek://home (sent by the home-screen widgets)
      if (first === 'home') {
        router.push('/(tabs)/home' as any);
        console.log('Deep link handled:', { route: '/(tabs)/home' });
        return;
      }

      // showseek://library (fallback when a widget has no list bound)
      if (first === 'library' && segments.length === 1) {
        router.push('/(tabs)/library' as any);
        console.log('Deep link handled:', { route: '/(tabs)/library' });
        return;
      }

      // showseek://library/custom-list/<id> (sent by the watchlist widget)
      if (first === 'library' && second === 'custom-list' && third) {
        router.push(`/(tabs)/library/custom-list/${third}` as any);
        console.log('Deep link handled:', {
          listId: third,
          route: `/(tabs)/library/custom-list/${third}`,
        });
        return;
      }

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
