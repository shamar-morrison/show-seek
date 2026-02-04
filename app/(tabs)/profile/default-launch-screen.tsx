/**
 * Default Launch Screen Selection
 * Allows authenticated users to select which tab the app opens to on launch
 */
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
  hexToRGBA,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { LaunchScreenRoute } from '@/src/types/preferences';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { Bookmark, Check, Compass, Home, Search, User } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export default function DefaultLaunchScreen() {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const updatePreference = useUpdatePreference();
  const { accentColor } = useAccentColor();
  const [isUpdating, setIsUpdating] = useState<LaunchScreenRoute | null>(null);

  const SCREEN_OPTIONS = useMemo(
    () => [
      { label: t('tabs.home'), value: '/(tabs)/home' as const, icon: Home },
      { label: t('tabs.discover'), value: '/(tabs)/discover' as const, icon: Compass },
      { label: t('tabs.search'), value: '/(tabs)/search' as const, icon: Search },
      { label: t('tabs.library'), value: '/(tabs)/library' as const, icon: Bookmark },
      { label: t('tabs.profile'), value: '/(tabs)/profile' as const, icon: User },
    ],
    [t]
  );

  const currentScreen = preferences?.defaultLaunchScreen || '/(tabs)/home';

  const handleSelectScreen = async (screen: LaunchScreenRoute) => {
    if (screen === currentScreen) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(screen);

    try {
      await updatePreference.mutateAsync({ key: 'defaultLaunchScreen', value: screen });
    } catch (error) {
      console.error('[DefaultLaunchScreen] Error updating preference:', error);
      Alert.alert(t('common.error'), t('settings.updateLaunchScreenError'));
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('settings.launchScreenDescription')}</Text>

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
                    color={isSelected ? accentColor : COLORS.textSecondary}
                    style={styles.optionIcon}
                  />
                  <Text style={[styles.optionLabel, isSelected && { color: accentColor }]}>
                    {option.label}
                  </Text>
                </View>

                <View style={styles.optionStatus}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={accentColor} />
                  ) : isSelected ? (
                    <View
                      style={[styles.checkContainer, { backgroundColor: hexToRGBA(accentColor, 0.2) }]}
                    >
                      <Check size={20} color={accentColor} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>{t('settings.launchScreenNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
