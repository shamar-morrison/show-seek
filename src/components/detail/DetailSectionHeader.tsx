import { ACTIVE_OPACITY, HIT_SLOP, SPACING } from '@/src/constants/theme';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity } from 'react-native';
import { useDetailStyles } from './detailStyles';

interface DetailSectionHeaderProps {
  title: string;
  /** Adds "See All" on the right; the whole header opens it. */
  onViewAll?: () => void;
  testID?: string;
}

/**
 * A section title on movie and TV pages, optionally with "See All" like the Cast row. Spaced the
 * same either way, so adding See All doesn't shift the section.
 */
export function DetailSectionHeader({ title, onViewAll, testID }: DetailSectionHeaderProps) {
  const { t } = useTranslation();
  const styles = useDetailStyles();

  if (!onViewAll) {
    return <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>{title}</Text>;
  }

  return (
    <TouchableOpacity
      style={[styles.sectionHeader, { marginTop: 0, marginBottom: 0, paddingBottom: SPACING.s }]}
      onPress={onViewAll}
      activeOpacity={ACTIVE_OPACITY}
      hitSlop={HIT_SLOP.m}
      accessibilityRole="button"
      testID={testID}
    >
      <Text style={[styles.sectionTitle, { paddingBottom: 0 }]}>{title}</Text>
      <Text style={styles.viewAll}>{t('common.seeAll')}</Text>
    </TouchableOpacity>
  );
}
