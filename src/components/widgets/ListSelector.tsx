import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { ACTIVE_OPACITY, COLORS, FONT_FAMILY } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useLists } from '@/src/hooks/useLists';
import { UserList } from '@/src/services/ListService';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface ListSelectorProps {
  selectedListId?: string;
  onSelect: (listId: string) => void;
}

export function ListSelector({ selectedListId, onSelect }: ListSelectorProps) {
  const { t } = useTranslation();
  const { data: lists, isLoading } = useLists();
  const { accentColor } = useAccentColor();

  if (isLoading || !lists) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('widgets.selectWatchlist')}</Text>
      <ScrollView
        {...HORIZONTAL_SCROLL_PROPS}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {lists.map((list: UserList) => {
          const isSelected = selectedListId === list.id;
          return (
            <Pressable
              key={list.id}
              style={({ pressed }) => [
                styles.listButton,
                isSelected && [
                  styles.selectedButton,
                  { borderColor: accentColor, backgroundColor: accentColor + '10' },
                ],
                pressed && { opacity: ACTIVE_OPACITY },
              ]}
              onPress={() => onSelect(list.id)}
            >
              <Text
                style={[
                  styles.listName,
                  isSelected && [styles.selectedText, { color: accentColor }],
                ]}
              >
                {list.name}
              </Text>
              {isSelected && <AppIcon icon={Tick02Icon} size={16} color={accentColor} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
    fontFamily: FONT_FAMILY.medium,
  },
  scrollContent: {
    gap: 12,
  },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  selectedButton: {},
  listName: {
    fontSize: 14,
    color: COLORS.text,
  },
  selectedText: {
    fontFamily: FONT_FAMILY.bold,
  },
  loading: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
