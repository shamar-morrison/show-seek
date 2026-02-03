import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';

export default function LibraryStackLayout() {
  return (
    <TabProvider tabName="library">
      <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* Watch Progress */}
        <Stack.Screen
          name="watch-progress"
          options={{ title: 'Watch Progress', headerShown: true }}
        />
        <Stack.Screen
          name="collection-progress"
          options={{ title: 'Collection Progress', headerShown: true }}
        />

        {/* Watch Status & Custom Lists */}
        <Stack.Screen name="watch-status" options={{ title: 'Watch Lists', headerShown: true }} />
        <Stack.Screen name="custom-lists" options={{ title: 'Custom Lists', headerShown: true }} />
        <Stack.Screen name="custom-list/[id]" options={{ title: '', headerShown: true }} />

        {/* Stats & History */}
        <Stack.Screen
          name="stats/index"
          options={{ title: 'Stats & History', headerShown: true }}
        />
        <Stack.Screen name="stats/[month]" options={{ title: '', headerShown: true }} />

        {/* Ratings */}
        <Stack.Screen
          name="ratings/episodes"
          options={{ title: 'Episode Ratings', headerShown: true }}
        />
        <Stack.Screen
          name="ratings/movies"
          options={{ title: 'Movie Ratings', headerShown: true }}
        />
        <Stack.Screen
          name="ratings/tv-shows"
          options={{ title: 'TV Show Ratings', headerShown: true }}
        />

        {/* Favorites */}
        <Stack.Screen name="favorites" options={{ title: 'Favorite Content', headerShown: true }} />
        <Stack.Screen
          name="favorite-people"
          options={{ title: 'Favorite People', headerShown: true }}
        />

        {/* Notifications */}
        <Stack.Screen name="reminders" options={{ title: 'Reminders', headerShown: true }} />
        <Stack.Screen name="notes" options={{ title: 'Notes', headerShown: true }} />

        {/* Widgets - has its own layout */}
        <Stack.Screen name="widgets" options={{ headerShown: false }} />

        {/* Existing detail screens */}
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
