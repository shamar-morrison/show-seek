/**
 * Default Launch Screen Selection Screen
 * Allows users to select which tab the app opens to on launch
 */
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { LaunchScreenRoute } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import { Bookmark, Check, Compass, Home, LucideIcon, Search, User } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenOption {
  label: string;
  value: LaunchScreenRoute;
  icon: LucideIcon;
}

const SCREEN_OPTIONS: ScreenOption[] = [
  { label: 'Home', value: '/(tabs)/home', icon: Home },
  { label: 'Discover', value: '/(tabs)/discover', icon: Compass },
  { label: 'Search', value: '/(tabs)/search', icon: Search },
  { label: 'Library', value: '/(tabs)/library', icon: Bookmark },
  { label: 'Profile', value: '/(tabs)/profile', icon: User },
];

export default function DefaultLaunchScreenScreen() {
  const { preferences, isLoading: isLoadingPreferences } = usePreferences();
  const updatePreference = useUpdatePreference();
  const [isUpdating, setIsUpdating] = useState<LaunchScreenRoute | null>(null);

  const currentSelection = preferences?.defaultLaunchScreen ?? '/(tabs)/home';

  const handleSelectScreen = async (route: LaunchScreenRoute) => {
    if (route === currentSelection) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(route);

    try {
      await updatePreference.mutateAsync({
        key: 'defaultLaunchScreen',
        value: route,
      });
    } catch (error) {
      console.error('[DefaultLaunchScreen] Error updating preference:', error);
      Alert.alert('Error', 'Failed to update launch screen. Please try again.');
    } finally {
      setIsUpdating(null);
    }
  };

  if (isLoadingPreferences) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          Choose which screen the app opens to when you launch ShowSeek.
        </Text>

        <View style={styles.optionList}>
          {SCREEN_OPTIONS.map((option, index) => {
            const isSelected = currentSelection === option.value;
            const isLoading = isUpdating === option.value;
            const Icon = option.icon;
            const isLast = index === SCREEN_OPTIONS.length - 1;

            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.optionItem,
                  isSelected && styles.optionItemSelected,
                  pressed && styles.optionItemPressed,
                  isLast && styles.optionItemLast,
                ]}
                onPress={() => handleSelectScreen(option.value)}
                disabled={isUpdating !== null}
              >
                <View style={styles.optionInfo}>
                  <View style={[styles.iconContainer, isSelected && styles.iconContainerSelected]}>
                    <Icon size={20} color={isSelected ? COLORS.primary : COLORS.textSecondary} />
                  </View>
                  <Text style={[styles.optionName, isSelected && styles.optionNameSelected]}>
                    {option.label}
                  </Text>
                </View>

                <View style={styles.optionStatus}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : isSelected ? (
                    <View style={styles.checkContainer}>
                      <Check size={20} color={COLORS.primary} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>This setting is synced across your devices.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: SPACING.l,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.l,
  },
  optionList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  optionItemLast: {
    borderBottomWidth: 0,
  },
  optionItemSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  optionItemPressed: {
    opacity: ACTIVE_OPACITY,
  },
  optionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerSelected: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
  },
  optionName: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionNameSelected: {
    color: COLORS.primary,
  },
  optionStatus: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  note: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.l,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.7,
  },
});
