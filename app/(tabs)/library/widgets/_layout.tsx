import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function WidgetsLayout() {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshAllWidgets } = useWidgets(user?.uid);
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        contentStyle: {
          backgroundColor: COLORS.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('library.homeScreenWidgets'),
        }}
      />
      <Stack.Screen
        name="configure/[widgetId]"
        options={{
          title: t('widgets.configureWidget'),
        }}
      />
    </Stack>
  );
}
