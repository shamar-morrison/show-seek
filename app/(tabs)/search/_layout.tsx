import { TAB_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { TabProvider } from '@/src/context/TabContext';
import { CommonDetailScreens } from '@/src/navigation/CommonDetailScreens';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function SearchStackLayout() {
  const { t } = useTranslation();

  return (
    <TabProvider tabName="search">
      <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="movie/[id]/watch-history"
          options={{ title: t('watched.watchHistory'), headerShown: true }}
        />
        <CommonDetailScreens />
      </Stack>
    </TabProvider>
  );
}
