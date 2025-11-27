import { COLORS } from '@/src/constants/theme';
import { Stack } from 'expo-router';

export default function DiscoverStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: COLORS.background },
        headerBackTitle: '',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="movie/[id]" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="tv/[id]" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="person/[id]" options={{ title: '', headerTransparent: true }} />
    </Stack>
  );
}
