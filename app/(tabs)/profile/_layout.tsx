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
    </Stack>
  );
}
