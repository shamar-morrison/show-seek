import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';

export default function HomeStackLayout() {
  return (
    <TabProvider tabName="home">
      <Stack
        screenOptions={TAB_STACK_SCREEN_OPTIONS}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="for-you" options={{ title: 'Just for you' }} />
        <Stack.Screen name="calendar" options={{ title: 'Release Calendar' }} />
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
