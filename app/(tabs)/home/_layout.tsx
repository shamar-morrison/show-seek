import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function HomeStackLayout() {
  const { t } = useTranslation();

  return (
    <TabProvider tabName="home">
      <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="for-you" options={{ title: t('forYou.title'), headerShown: true }} />
        <Stack.Screen name="calendar" options={{ title: t('calendar.title'), headerShown: true }} />
        <Stack.Screen name="mood-picker" options={{ title: t('mood.picker'), headerShown: true }} />
        <Stack.Screen
          name="where-to-watch"
          options={{ title: t('whereToWatch.title'), headerShown: true }}
        />
        <Stack.Screen name="mood-results" options={{ title: '', headerShown: true }} />
        <Stack.Screen
          name="movie/[id]/watch-history"
          options={{ title: t('watched.watchHistory'), headerShown: true }}
        />
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
