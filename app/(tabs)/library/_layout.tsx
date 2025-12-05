import { COLORS } from '@/src/constants/theme';
import { TabProvider } from '@/src/context/TabContext';
import { Stack } from 'expo-router';

export default function LibraryStackLayout() {
  return (
    <TabProvider tabName="library">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: COLORS.background },
          headerBackTitle: '',
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* Watch Status & Custom Lists */}
        <Stack.Screen name="watch-status" options={{ title: 'Watch Status Lists' }} />
        <Stack.Screen name="custom-lists" options={{ title: 'Custom Lists' }} />
        <Stack.Screen name="custom-list/[id]" options={{ title: '' }} />

        {/* Ratings */}
        <Stack.Screen name="ratings/episodes" options={{ title: 'Episode Ratings' }} />
        <Stack.Screen name="ratings/movies" options={{ title: 'Movie Ratings' }} />
        <Stack.Screen name="ratings/tv-shows" options={{ title: 'TV Show Ratings' }} />

        {/* Favorites */}
        <Stack.Screen name="favorites" options={{ title: 'Favorite Content' }} />
        <Stack.Screen name="favorite-people" options={{ title: 'Favorite People' }} />

        {/* Notifications */}
        <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />

        {/* Existing detail screens */}
        <Stack.Screen name="movie/[id]/index" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen
          name="movie/[id]/cast"
          options={{ title: 'Cast & Crew', presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen name="tv/[id]/index" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen
          name="tv/[id]/cast"
          options={{ title: 'Cast & Crew', presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen name="tv/[id]/seasons" options={{ title: 'Seasons' }} />
        <Stack.Screen
          name="tv/[id]/season/[seasonNum]/episode/[episodeNum]/index"
          options={{ title: '', headerTransparent: true, headerBackTitle: 'Season' }}
        />
        <Stack.Screen name="person/[id]/index" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen
          name="collection/[id]/index"
          options={{ title: '', headerTransparent: true }}
        />
        <Stack.Screen name="review/[id]" options={{ title: '', headerTransparent: true }} />
      </Stack>
    </TabProvider>
  );
}
