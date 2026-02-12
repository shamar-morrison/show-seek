import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePreferences } from '@/src/hooks/usePreferences';
import { Redirect, Tabs } from 'expo-router';
import { Bookmark, Compass, Home, Search, User } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { preferences } = usePreferences();
  const { accentColor } = useAccentColor();

  const hideLabels = preferences?.hideTabLabels ?? false;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: accentColor,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerShown: false,
        tabBarShowLabel: !hideLabels,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.surfaceLight,
          borderTopWidth: 1,
          height: (hideLabels ? 56 : 70) + insets.bottom,
          paddingTop: 5,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 4,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingVertical: 4,
        },
        // @ts-expect-error - detachInactiveScreens is supported but not in types
        detachInactiveScreens: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
          // @ts-expect-error - unmountOnBlur is supported but not in types
          unmountOnBlur: true,
        }}
      />
    </Tabs>
  );
}
