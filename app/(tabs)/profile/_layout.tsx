/**
 * Profile directory layout
 * Enables nested navigation within the profile tab
 */

import { COLORS } from '@/src/constants/theme';
import { Stack } from 'expo-router';
import React from 'react';

export default function ProfileLayout() {
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
        name="language"
        options={{
          headerShown: true,
          headerTitle: 'Language',
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <Stack.Screen
        name="region"
        options={{
          headerShown: true,
          headerTitle: 'Region',
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <Stack.Screen
        name="default-launch-screen"
        options={{
          headerShown: true,
          headerTitle: 'Default Launch Screen',
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
    </Stack>
  );
}
