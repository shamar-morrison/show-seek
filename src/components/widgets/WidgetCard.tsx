import { COLORS } from '@/src/constants/theme';
import { WidgetConfig } from '@/src/types';
import { Settings, Smartphone, Trash2 } from 'lucide-react-native';
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
      <View style={styles.iconContainer}>
        <Smartphone size={24} color={COLORS.primary} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{getTypeLabel()}</Text>
        <Text style={styles.subtitle}>{t('widgets.widgetSizeLabel', { size: getSizeLabel() })}</Text>
        {widget.listId && (
          <Text style={styles.listInfo}>{t('widgets.listIdLabel', { id: widget.listId })}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onEdit} style={styles.actionButton}>
          <Settings size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
          <Trash2 size={20} color={COLORS.error} />
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
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
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
