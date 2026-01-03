import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { Stack, useRouter } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';

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
          headerRight: () => (
            <Pressable onPress={refreshAllWidgets} style={{ padding: 8 }}>
              <RefreshCw size={20} color={COLORS.text} />
            </Pressable>
          ),
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
