/**
 * Profile directory layout
 * Enables nested navigation within the profile tab
 */

import { COLORS } from '@/src/constants/theme';
import { ImdbImportFlowProvider } from '@/src/context/ImdbImportFlowContext';
import { TvTimeImportFlowProvider } from '@/src/context/TvTimeImportFlowContext';
import { Stack } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function ProfileLayout() {
  const { t } = useTranslation();

  return (
    <ImdbImportFlowProvider>
      <TvTimeImportFlowProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen
            name="account"
            options={{
              headerShown: true,
              headerTitle: t('settings.account'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="edit-profile"
            options={{
              headerShown: true,
              headerTitle: t('profile.editProfile'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen name="trakt-settings" />
          <Stack.Screen name="stremio-settings" />
          <Stack.Screen
            name="stremio-how-it-works"
            options={{
              headerShown: true,
              headerTitle: t('stremio.how.title'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="export-data"
            options={{
              headerShown: true,
              headerTitle: t('profile.exportData'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="imdb-import"
            options={{
              headerShown: true,
              headerTitle: t('profile.importFromImdb'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="imdb-import-progress"
            options={{
              headerShown: true,
              headerTitle: t('imdbImport.importingTitle'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="tvtime-import"
            options={{
              headerShown: true,
              headerTitle: t('profile.importFromTvTime'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
          <Stack.Screen
            name="tvtime-import-progress"
            options={{
              headerShown: true,
              headerTitle: t('tvtimeImport.importingTitle'),
              headerStyle: { backgroundColor: COLORS.background },
              headerTintColor: COLORS.text,
            }}
          />
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
      </TvTimeImportFlowProvider>
    </ImdbImportFlowProvider>
  );
}
