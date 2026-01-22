import { COLORS } from '@/src/constants/theme';
import { TabProvider } from '@/src/context/TabContext';
import { Stack } from 'expo-router';

export default function HomeStackLayout() {
  return (
    <TabProvider tabName="home">
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
        <Stack.Screen name="for-you" options={{ title: 'For You' }} />
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
