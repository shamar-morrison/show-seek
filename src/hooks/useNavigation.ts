// Re-export the useCurrentTab hook from TabContext
export { useCurrentTab } from '@/src/contexts/TabContext';

/**
 * Build a navigation path that preserves the current tab context
 * @param path - The path to navigate to (e.g., "/movie/123")
 * @returns The full path with tab context (e.g., "/(tabs)/home/movie/123")
 */
export function useTabAwarePath() {
  const { useCurrentTab } = require('@/src/contexts/TabContext');
  const currentTab = useCurrentTab();

  return (path: string) => {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    if (currentTab) {
      return `/(tabs)/${currentTab}/${cleanPath}`;
    }
    return `/${cleanPath}`;
  };
}
