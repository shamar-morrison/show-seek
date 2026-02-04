import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { UserList } from '@/src/services/ListService';
import { Check } from 'lucide-react-native';
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

  if (isLoading || !lists) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('widgets.selectWatchlist')}</Text>
      <ScrollView
        horizontal
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
                isSelected && styles.selectedButton,
                pressed && { opacity: ACTIVE_OPACITY },
              ]}
              onPress={() => onSelect(list.id)}
            >
              <Text style={[styles.listName, isSelected && styles.selectedText]}>{list.name}</Text>
              {isSelected && <Check size={16} color={COLORS.primary} />}
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
    fontWeight: '500',
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
  selectedButton: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  listName: {
    fontSize: 14,
    color: COLORS.text,
  },
  selectedText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  loading: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
