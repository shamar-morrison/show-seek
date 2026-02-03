import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';

export default function DiscoverStackLayout() {
  return (
    <TabProvider tabName="discover">
      <Stack
        screenOptions={TAB_STACK_SCREEN_OPTIONS}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
