import { COLORS, FONT_FAMILY } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { WidgetConfig } from '@/src/types';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Delete02Icon, Settings01Icon, SmartPhone01Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface WidgetCardProps {
  widget: WidgetConfig;
  onEdit: () => void;
  onDelete: () => void;
}

export function WidgetCard({ widget, onEdit, onDelete }: WidgetCardProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const getTypeLabel = () => {
    switch (widget.type) {
      case 'upcoming-movies':
        return t('widgets.type.upcomingMovies');
      case 'upcoming-tv':
        return t('widgets.type.upcomingTV');
      case 'watchlist':
        return t('widgets.type.watchlist');
      default:
        return t('media.unknown');
    }
  };

  const getSizeLabel = () => {
    return t(`widgets.size.${widget.size}`);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: accentColor + '20' }]}>
        <AppIcon icon={SmartPhone01Icon} size={24} color={accentColor} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{getTypeLabel()}</Text>
        <Text style={styles.subtitle}>
          {t('widgets.widgetSizeLabel', { size: getSizeLabel() })}
        </Text>
        {widget.listId && (
          <Text style={styles.listInfo}>{t('widgets.listIdLabel', { id: widget.listId })}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onEdit} style={styles.actionButton}>
          <AppIcon icon={Settings01Icon} size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
          <AppIcon icon={Delete02Icon} size={20} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  listInfo: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
});
