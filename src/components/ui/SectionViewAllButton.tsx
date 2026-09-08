import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, HIT_SLOP } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleProp, TouchableOpacity, ViewStyle } from 'react-native';

const BUTTON_DIAMETER = 30;
const CHEVRON_SIZE = 18;

export interface SectionViewAllButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Circular "view all" affordance for section headers.
 *
 * Filled accent mini-FAB with a centered white chevron. Replaces the plain
 * arrow glyph previously used next to section titles so the tap target
 * reads as tappable. Pass the same handler as the surrounding header row
 * so taps anywhere on the row (title or button) navigate identically.
 */
export const SectionViewAllButton = memo<SectionViewAllButtonProps>(
  ({ onPress, style, testID = 'section-view-all-button' }) => {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={ACTIVE_OPACITY}
        hitSlop={HIT_SLOP.s}
        accessibilityRole="button"
        accessibilityLabel={t('common.seeAll')}
        testID={testID}
        style={[
          {
            width: BUTTON_DIAMETER,
            height: BUTTON_DIAMETER,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: accentColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <AppIcon icon={ArrowRight01Icon} size={CHEVRON_SIZE} color={COLORS.white} />
      </TouchableOpacity>
    );
  }
);

SectionViewAllButton.displayName = 'SectionViewAllButton';
