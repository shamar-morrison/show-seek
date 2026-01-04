import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { Stack, useRouter } from 'expo-router';
import React from 'react';

export default function WidgetsLayout() {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshAllWidgets } = useWidgets(user?.uid);

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
          title: 'Home Screen Widgets',
        }}
      />
      <Stack.Screen
        name="configure/[widgetId]"
        options={{
          title: 'Configure Widget',
        }}
      />
    </Stack>
  );
}
