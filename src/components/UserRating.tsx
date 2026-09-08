import { AppIcon } from '@/src/components/ui/AppIcon';
import { StarIcon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAccentColor } from '../context/AccentColorProvider';
import { COLORS, FONT_SIZE, SPACING } from '../constants/theme';
import { getRatingText } from '../utils/ratingHelpers';
import { FONT_FAMILY } from '@/src/constants/theme';

interface UserRatingProps {
  rating: number;
}

export default function UserRating({ rating }: UserRatingProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  if (!rating) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('rating.yourRating')}:</Text>
      <View style={styles.ratingContent}>
        <AppIcon icon={StarIcon} size={16} color={accentColor} fill={accentColor} />
        <Text style={styles.ratingText}>
          {rating}/10 - <Text style={styles.description}>{getRatingText(rating)}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.m,
    marginBottom: 0,
  },
  label: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  ratingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
  },
  description: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
  },
});
