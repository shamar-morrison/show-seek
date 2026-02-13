/**
 * Profile directory layout
 * Enables nested navigation within the profile tab
 */

import { COLORS } from '@/src/constants/theme';
import { Stack } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function ProfileLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="trakt-settings" />
      <Stack.Screen
        name="about"
        options={{
          headerShown: true,
          headerTitle: t('settings.about'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <Stack.Screen
        name="language"
        options={{
          headerShown: true,
          headerTitle: t('settings.language'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <Stack.Screen
        name="region"
        options={{
          headerShown: true,
          headerTitle: t('settings.region'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <Stack.Screen
        name="colors"
        options={{
          headerShown: true,
          headerTitle: t('settings.accentColor'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <Stack.Screen
        name="default-launch-screen"
        options={{
          headerShown: true,
          headerTitle: t('settings.defaultLaunchScreen'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
    </Stack>
  );
}
