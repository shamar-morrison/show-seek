import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';

export default function LibraryStackLayout() {
  return (
    <TabProvider tabName="library">
      <Stack
        screenOptions={TAB_STACK_SCREEN_OPTIONS}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* Watch Progress */}
        <Stack.Screen name="watch-progress" options={{ title: 'Watch Progress' }} />

        {/* Watch Status & Custom Lists */}
        <Stack.Screen name="watch-status" options={{ title: 'Watch Lists' }} />
        <Stack.Screen name="custom-lists" options={{ title: 'Custom Lists' }} />
        <Stack.Screen name="custom-list/[id]" options={{ title: '' }} />

        {/* Stats & History */}
        <Stack.Screen name="stats/index" options={{ title: 'Stats & History' }} />
        <Stack.Screen name="stats/[month]" options={{ title: '' }} />

        {/* Ratings */}
        <Stack.Screen name="ratings/episodes" options={{ title: 'Episode Ratings' }} />
        <Stack.Screen name="ratings/movies" options={{ title: 'Movie Ratings' }} />
        <Stack.Screen name="ratings/tv-shows" options={{ title: 'TV Show Ratings' }} />

        {/* Favorites */}
        <Stack.Screen name="favorites" options={{ title: 'Favorite Content' }} />
        <Stack.Screen name="favorite-people" options={{ title: 'Favorite People' }} />

        {/* Notifications */}
        <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
        <Stack.Screen name="notes" options={{ title: 'Notes' }} />

        {/* Widgets - has its own layout */}
        <Stack.Screen name="widgets" options={{ headerShown: false }} />

        {/* Existing detail screens */}
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
