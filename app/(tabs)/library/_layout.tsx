import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function LibraryStackLayout() {
  const { t } = useTranslation();

  return (
    <TabProvider tabName="library">
      <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* Watch Progress */}
        <Stack.Screen
          name="watch-progress"
          options={{ title: t('library.watchProgress'), headerShown: true }}
        />
        <Stack.Screen
          name="collection-progress"
          options={{ title: t('library.collectionProgress'), headerShown: true }}
        />

        {/* Watch Status & Custom Lists */}
        <Stack.Screen
          name="watch-status"
          options={{ title: t('library.watchLists'), headerShown: true }}
        />
        <Stack.Screen name="watch-status/[id]" options={{ title: '', headerShown: true }} />
        <Stack.Screen
          name="custom-lists"
          options={{ title: t('library.customLists'), headerShown: true }}
        />
        <Stack.Screen name="custom-list/[id]" options={{ title: '', headerShown: true }} />

        {/* Stats & History */}
        <Stack.Screen
          name="stats/index"
          options={{ title: t('library.statsAndHistory'), headerShown: true }}
        />
        <Stack.Screen name="stats/[month]" options={{ title: '', headerShown: true }} />

        {/* Ratings */}
        <Stack.Screen
          name="ratings/episodes"
          options={{ title: t('library.episodeRatings'), headerShown: true }}
        />
        <Stack.Screen
          name="ratings/movies"
          options={{ title: t('library.movieRatings'), headerShown: true }}
        />
        <Stack.Screen
          name="ratings/tv-shows"
          options={{ title: t('library.tvShowRatings'), headerShown: true }}
        />

        {/* Favorites */}
        <Stack.Screen
          name="favorites"
          options={{ title: t('library.favoriteContent'), headerShown: true }}
        />
        <Stack.Screen
          name="favorite-episodes"
          options={{ title: t('library.favoriteEpisodes'), headerShown: true }}
        />
        <Stack.Screen
          name="favorite-people"
          options={{ title: t('library.favoritePeople'), headerShown: true }}
        />

        {/* Notifications */}
        <Stack.Screen
          name="reminders"
          options={{ title: t('library.reminders'), headerShown: true }}
        />
        <Stack.Screen name="notes" options={{ title: t('library.notes'), headerShown: true }} />

        {/* Widgets - has its own layout */}
        <Stack.Screen name="widgets" options={{ headerShown: false }} />

        {/* Existing detail screens */}
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
