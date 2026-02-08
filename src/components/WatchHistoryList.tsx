import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { WatchInstance } from '@/src/types/watchedMovies';
import { FlashList } from '@shopify/flash-list';
import { Calendar, Trash2 } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

interface WatchHistoryItemProps {
  instance: WatchInstance;
  onDelete?: (instanceId: string) => void;
}

function WatchHistoryItem({ instance, onDelete }: WatchHistoryItemProps) {
  const { t, i18n } = useTranslation();

  const formattedDate = instance.watchedAt.toLocaleDateString(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const handleDelete = useCallback(() => {
    if (onDelete) {
      Alert.alert(t('common.delete'), t('watched.deleteWatchConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => onDelete(instance.id),
        },
      ]);
    }
  }, [instance.id, onDelete, t]);

  return (
    <View style={styles.itemContainer}>
      <View style={styles.itemContent}>
        <View style={styles.dateRow}>
          <Calendar size={16} color={COLORS.textSecondary} />
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>
      </View>
      {onDelete && (
        <Pressable
          onPress={handleDelete}
          style={styles.deleteButton}
          accessibilityLabel={t('common.delete')}
        >
          <Trash2 size={20} color={COLORS.error} />
        </Pressable>
      )}
    </View>
  );
}

interface WatchHistoryListProps {
  instances: WatchInstance[];
  onDeleteInstance?: (instanceId: string) => void;
  isLoading?: boolean;
}

export function WatchHistoryList({
  instances,
  onDeleteInstance,
  isLoading,
}: WatchHistoryListProps) {
  const { t } = useTranslation();

  const renderItem = useCallback(
    ({ item }: { item: WatchInstance }) => (
      <WatchHistoryItem instance={item} onDelete={onDeleteInstance} />
    ),
    [onDeleteInstance]
  );

  if (instances.length === 0 && !isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('watched.noWatchHistory')}</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={instances}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: SPACING.m,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    marginBottom: SPACING.s,
  },
  itemContent: {
    flex: 1,
    gap: SPACING.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  dateText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '500',
    color: COLORS.text,
  },
  deleteButton: {
    padding: SPACING.s,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
