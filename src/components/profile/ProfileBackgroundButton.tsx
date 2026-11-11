import { AppIcon } from '@/src/components/ui/AppIcon';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useProfileBackground } from '@/src/hooks/useProfileBackground';
import type { ProfileBackground } from '@/src/utils/profileBackground';
import { UserSquareIcon } from '@hugeicons/core-free-icons';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, Text, TextStyle, ViewStyle } from 'react-native';

interface ProfileBackgroundButtonProps {
  /** The poster or backdrop being viewed. */
  image: ProfileBackground;
  /** Opens "Position backdrop" for this image (only for signed-in people). */
  onChoose: (image: ProfileBackground) => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * The image viewer's "Set as profile backdrop" button. Its icon is tinted with the accent colour
 * when the image is already the backdrop. Guests get the sign-in prompt instead.
 */
export function ProfileBackgroundButton({
  image,
  onChoose,
  style,
  labelStyle,
}: ProfileBackgroundButtonProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const isAccountRequired = useAccountRequired();
  const { profileBackground } = useProfileBackground();
  const isCurrent = profileBackground?.path === image.path;

  const handlePress = useCallback(() => {
    if (isAccountRequired()) return;
    // Re-positioning the current backdrop starts from where it was left.
    onChoose(isCurrent && profileBackground ? { ...image, focus: profileBackground.focus } : image);
  }, [image, isAccountRequired, isCurrent, onChoose, profileBackground]);

  return (
    <Pressable
      style={({ pressed }) => [style, pressed && { opacity: ACTIVE_OPACITY }]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('profile.useAsBackground')}
      accessibilityState={{ selected: isCurrent }}
      testID="image-lightbox-profile-background-button"
    >
      <AppIcon icon={UserSquareIcon} size={24} color={isCurrent ? accentColor : COLORS.white} />
      <Text style={labelStyle} numberOfLines={2}>
        {t('profile.useAsBackground')}
      </Text>
    </Pressable>
  );
}
