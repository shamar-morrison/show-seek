import { COLORS, FONT_FAMILY } from '@/src/constants/theme';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tv01Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export const WatchingEmptyState = () => {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <AppIcon icon={Tv01Icon} size={48} color={COLORS.secondary} />
      </View>
      <Text style={styles.title}>{t('library.emptyWatchProgress')}</Text>
      <Text style={styles.message}>{t('library.emptyWatchProgressHint')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 60,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceLight, // was surface.secondary
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text, // was text.primary
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary, // was text.secondary
    textAlign: 'center',
    lineHeight: 20,
  },
});
