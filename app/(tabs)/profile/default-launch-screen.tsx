/**
 * Default Launch Screen Selection
 * Allows authenticated users to select which tab the app opens to on launch
 */
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { LaunchScreenRoute } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import { Bookmark, Check, Compass, Home, Search, User } from 'lucide-react-native';
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

const SCREEN_OPTIONS: {
  label: string;
  value: LaunchScreenRoute;
  icon: typeof Home;
}[] = [
  { label: 'Home', value: '/(tabs)/home', icon: Home },
  { label: 'Discover', value: '/(tabs)/discover', icon: Compass },
  { label: 'Search', value: '/(tabs)/search', icon: Search },
  { label: 'Library', value: '/(tabs)/library', icon: Bookmark },
  { label: 'Profile', value: '/(tabs)/profile', icon: User },
];

export default function DefaultLaunchScreen() {
  const { preferences } = usePreferences();
  const updatePreference = useUpdatePreference();
  const [isUpdating, setIsUpdating] = useState<LaunchScreenRoute | null>(null);

  const currentScreen = preferences?.defaultLaunchScreen || '/(tabs)/home';

  const handleSelectScreen = async (screen: LaunchScreenRoute) => {
    if (screen === currentScreen) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(screen);

    try {
      await updatePreference.mutateAsync({ key: 'defaultLaunchScreen', value: screen });
    } catch (error) {
      console.error('[DefaultLaunchScreen] Error updating preference:', error);
      Alert.alert('Error', 'Failed to update launch screen preference. Please try again.');
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          Choose which screen the app opens to when you launch it.
        </Text>

        <View style={styles.optionsList}>
          {SCREEN_OPTIONS.map((option) => {
            const isSelected = currentScreen === option.value;
            const isLoading = isUpdating === option.value;
            const Icon = option.icon;

            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.optionItem,
                  isSelected && styles.optionItemSelected,
                  pressed && styles.optionItemPressed,
                ]}
                onPress={() => handleSelectScreen(option.value)}
                disabled={isUpdating !== null}
              >
                <View style={styles.optionInfo}>
                  <Icon
                    size={22}
                    color={isSelected ? COLORS.primary : COLORS.textSecondary}
                    style={styles.optionIcon}
                  />
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
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

        <Text style={styles.note}>
          This setting will take effect the next time you open the app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.l,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginBottom: SPACING.l,
    lineHeight: 22,
  },
  optionsList: {
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
  optionItemSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  optionItemPressed: {
    opacity: ACTIVE_OPACITY,
  },
  optionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    marginRight: SPACING.m,
  },
  optionLabel: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionLabelSelected: {
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
