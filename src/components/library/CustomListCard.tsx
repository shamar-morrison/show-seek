import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { StackedPosterPreview } from '@/src/components/library/StackedPosterPreview';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useLongPressPressGuard } from '@/src/hooks/useLongPressPressGuard';
import { UserList } from '@/src/services/ListService';
import { ChevronRight } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface CustomListCardProps {
  list: UserList;
  onPress: (listId: string) => void;
  onLongPress?: (listId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
}

export const CustomListCard = memo<CustomListCardProps>(
  ({ list, onPress, onLongPress, selectionMode = false, isSelected = false }) => {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();

    const handlePress = useCallback(() => {
      onPress(list.id);
    }, [list.id, onPress]);

    const handleLongPress = useCallback(() => {
      onLongPress?.(list.id);
    }, [list.id, onLongPress]);

    const { handlePress: handleCardPress, handleLongPress: handleCardLongPress, handlePressOut } =
      useLongPressPressGuard({
        onPress: handlePress,
        onLongPress: onLongPress ? handleLongPress : undefined,
      });

    const { itemCount, previewItems } = useMemo(() => {
      const items = list.items || {};
      const nextPreviewItems: Array<{
        mediaType: 'movie' | 'tv';
        mediaId: number;
        posterPath: string | null;
      }> = [];
      let nextItemCount = 0;

      for (const itemKey in items) {
        const mediaItem = items[itemKey];
        if (!mediaItem) {
          continue;
        }

        nextItemCount += 1;

        if (nextPreviewItems.length < 3) {
          nextPreviewItems.push({
            mediaType: mediaItem.media_type,
            mediaId: mediaItem.id,
            posterPath: mediaItem.poster_path,
          });
        }
      }

      return {
        itemCount: nextItemCount,
        previewItems: nextPreviewItems,
      };
    }, [list.items]);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.container,
          pressed && styles.pressed,
          selectionMode && styles.selectionEnabledContainer,
          isSelected && { borderColor: accentColor, backgroundColor: COLORS.surfaceLight },
        ]}
        onPress={handleCardPress}
        onLongPress={onLongPress ? handleCardLongPress : undefined}
        onPressOut={handlePressOut}
        testID={`custom-list-card-${list.id}`}
      >
        {selectionMode && (
          <View
            style={[
              styles.selectionBadge,
              isSelected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            testID={`custom-list-card-selection-badge-${list.id}`}
          >
            <AnimatedCheck visible={isSelected} />
          </View>
        )}

        <StackedPosterPreview items={previewItems} />

        <View style={styles.listInfo}>
          <Text style={styles.listName}>{list.name}</Text>
          {!!list.description?.trim() && (
            <Text style={styles.listDescription} numberOfLines={2}>
              {list.description.trim()}
            </Text>
          )}
          <Text style={styles.itemCount}>
            {itemCount === 1 ? t('library.itemCountOne') : t('library.itemCount', { count: itemCount })}
          </Text>
        </View>

        {!selectionMode && <ChevronRight size={20} color={COLORS.textSecondary} />}
      </Pressable>
    );
  }
);

CustomListCard.displayName = 'CustomListCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  selectionEnabledContainer: {
    borderColor: 'transparent',
  },
  selectionBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  listName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  listDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  itemCount: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
