import { COLORS, FONT_FAMILY } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePreferences } from '@/src/hooks/usePreferences';
import { Redirect, Tabs } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  BinocularsIcon,
  Bookmark02Icon,
  Home01Icon,
  Search01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
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
          fontFamily: FONT_FAMILY.semiBold,
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
          tabBarIcon: ({ color, size }) => <AppIcon icon={Home01Icon} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon icon={Search01Icon} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon icon={BinocularsIcon} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color, size }) => (
            <AppIcon icon={Bookmark02Icon} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <AppIcon icon={UserIcon} color={color} size={size} />,
          // @ts-expect-error - unmountOnBlur is supported but not in types
          unmountOnBlur: true,
        }}
      />
    </Tabs>
  );
}
