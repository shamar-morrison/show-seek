import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

interface CollapsibleCategoryProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible category section showing a group of features
 */
export function CollapsibleCategory({
  title,
  defaultExpanded = false,
  children,
}: CollapsibleCategoryProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  return (
    <View style={styles.categoryContainer}>
      <Pressable style={styles.categoryHeader} onPress={toggleExpanded}>
        <Text style={styles.categoryTitle}>{title}</Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.textSecondary}
        />
      </Pressable>

      {isExpanded && <View style={styles.categoryFeatures}>{children}</View>}
    </View>
  );
}

interface CollapsibleFeatureItemProps {
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  description?: string;
  isNew?: boolean;
}

/**
 * Individual feature display within a collapsible category
 */
export function CollapsibleFeatureItem({
  text,
  icon,
  description,
  isNew,
}: CollapsibleFeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      {icon && <Ionicons name={icon} size={22} color={COLORS.primary} style={styles.featureIcon} />}
      <View style={styles.featureContent}>
        <View style={styles.featureTitleRow}>
          <Text style={styles.featureTitle}>{text}</Text>
          {isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
        </View>
        {description && <Text style={styles.featureDescription}>{description}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryContainer: {
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  categoryFeatures: {
    paddingHorizontal: 12,
    paddingTop: SPACING.s,
    paddingBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  featureIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  featureTitle: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  featureDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  newBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.s,
  },
  newBadgeText: {
    color: COLORS.black,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
