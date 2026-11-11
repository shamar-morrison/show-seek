import { AppIcon } from '@/src/components/ui/AppIcon';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useProfileBackground } from '@/src/hooks/useProfileBackground';
import type { ProfileBackground } from '@/src/utils/profileBackground';
import { UserSquareIcon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleProp, Text, TextStyle, ViewStyle } from 'react-native';

interface ProfileBackgroundButtonProps {
  /** The poster or backdrop being viewed. */
  image: ProfileBackground;
  onShowToast: (message: string) => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * The image viewer's "Set as profile backdrop" button. Its icon is tinted with the accent colour
 * when the image is already the backdrop. Guests get the sign-in prompt.
 */
export function ProfileBackgroundButton({
  image,
  onShowToast,
  style,
  labelStyle,
}: ProfileBackgroundButtonProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const isAccountRequired = useAccountRequired();
  const { profileBackground, setProfileBackground, isSaving } = useProfileBackground();
  const isCurrent = profileBackground?.path === image.path;

  const handlePress = useCallback(async () => {
    if (isAccountRequired()) return;
    try {
      await setProfileBackground(image);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onShowToast(t('profile.backgroundSet'));
    } catch (error) {
      console.error('[ProfileBackgroundButton] Failed to set background:', error);
      onShowToast(t('profile.backgroundFailed'));
    }
  }, [image, isAccountRequired, onShowToast, setProfileBackground, t]);

  return (
    <Pressable
      style={({ pressed }) => [style, pressed && { opacity: ACTIVE_OPACITY }]}
      onPress={handlePress}
      disabled={isSaving}
      accessibilityRole="button"
      accessibilityLabel={t('profile.useAsBackground')}
      accessibilityState={{ selected: isCurrent, disabled: isSaving }}
      testID="image-lightbox-profile-background-button"
    >
      {isSaving ? (
        <ActivityIndicator size="small" color={COLORS.white} />
      ) : (
        <AppIcon icon={UserSquareIcon} size={24} color={isCurrent ? accentColor : COLORS.white} />
      )}
      <Text style={labelStyle} numberOfLines={2}>
        {t('profile.useAsBackground')}
      </Text>
    </Pressable>
  );
}
