import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type CategoryTab = {
  key: string;
  label: string;
};

type CategoryTabsProps = {
  tabs: CategoryTab[];
  activeKey: string;
  onChange: (key: string) => void;
  testID?: string;
};

export function CategoryTabs({ tabs, activeKey, onChange, testID }: CategoryTabsProps) {
  const { accentColor } = useAccentColor();

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
        testID={testID ? `${testID}-scroll` : undefined}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tab, isActive && { backgroundColor: accentColor }]}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              testID={testID ? `${testID}-tab-${tab.key}` : undefined}
            >
              <Text style={[styles.tabText, isActive && styles.activeTabText]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING.m,
  },
  tabsContent: {
    paddingHorizontal: SPACING.l,
    gap: SPACING.s,
    paddingBottom: SPACING.m,
  },
  tab: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  tabText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.white,
  },
});
