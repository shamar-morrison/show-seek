import { AVAILABLE_TMDB_LISTS } from '@/src/constants/homeScreenLists';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import type { HomeScreenListItem } from '@/src/types/preferences';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface FavoriteListsStepProps {
  selectedLists: HomeScreenListItem[];
  onSelect: (lists: HomeScreenListItem[]) => void;
}

export default function FavoriteListsStep({ selectedLists, onSelect }: FavoriteListsStepProps) {
  const { t } = useTranslation();

  const handleToggle = useCallback(
    (listItem: (typeof AVAILABLE_TMDB_LISTS)[number]) => {
      const exists = selectedLists.some((l) => l.id === listItem.id);

      if (exists) {
        onSelect(selectedLists.filter((l) => l.id !== listItem.id));
      } else {
        if (selectedLists.length >= 6) return; // Max 6
        onSelect([
          ...selectedLists,
          { id: listItem.id, type:     'tmdb' as const, label: listItem.label },
        ]);
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [selectedLists, onSelect]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.title}>{t('personalOnboarding.listsTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.listsSubtitle')}</Text>
      </Animated.View>

      {selectedLists.length > 0 && (
        <Text style={styles.selectedCount}>
          {t('personalOnboarding.selected', { count: selectedLists.length })}
        </Text>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {AVAILABLE_TMDB_LISTS.filter((item) => item.id !== 'latest-trailers').map((listItem, index) => {
          const isSelected = selectedLists.some((l) => l.id === listItem.id);

          return (
            <Animated.View
              key={listItem.id}
              entering={FadeInDown.duration(300).delay(index * 60)}
            >
              <Pressable
                style={[styles.listCard, isSelected && styles.listCardSelected]}
                onPress={() => handleToggle(listItem)}
              >
                <Text style={[styles.listLabel, isSelected && styles.listLabelSelected]}>
                  {listItem.label}
                </Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Check size={14} color={COLORS.white} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
    lineHeight: 20,
  },
  selectedCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
    gap: SPACING.s,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  listCardSelected: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  listLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  listLabelSelected: {
    color: COLORS.white,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
