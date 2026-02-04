import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

/**
 * Ionicons name type for type-safe icon references
 */
type IoniconsName = ComponentProps<typeof Ionicons>['name'];

/**
 * Represents a single premium feature
 */
export interface PremiumFeature {
  /** Unique identifier for the feature */
  id: string;
  /** Ionicons icon name */
  icon: IoniconsName;
  /** Translation key for display title */
  titleKey: string;
  /** Translation key for optional short description */
  descriptionKey?: string;
  /** Show "NEW" badge if true */
  isNew?: boolean;
}

/**
 * Represents a category grouping of premium features
 */
export interface PremiumCategory {
  /** Unique identifier for the category */
  id: string;
  /** Translation key for category display title */
  titleKey: string;
  /** Features within this category */
  features: PremiumFeature[];
}

/**
 * All premium features organized by category.
 *
 * When adding new premium features:
 * 1. Find the appropriate category (or create a new one)
 * 2. Add the feature with a unique id, icon, and title
 * 3. Set isNew: true for newly added features (remove after a few releases)
 */
export const PREMIUM_CATEGORIES: PremiumCategory[] = [
  {
    id: 'lists',
    titleKey: 'premiumFeatures.categories.lists',
    features: [
      {
        id: 'unlimited-lists',
        icon: 'list',
        titleKey: 'premiumFeatures.features.unlimited-lists.title',
        descriptionKey: 'premiumFeatures.features.unlimited-lists.description',
      },
      {
        id: 'unlimited-items',
        icon: 'infinite',
        titleKey: 'premiumFeatures.features.unlimited-items.title',
        descriptionKey: 'premiumFeatures.features.unlimited-items.description',
      },
      {
        id: 'personal-notes',
        icon: 'document-text-outline',
        titleKey: 'premiumFeatures.features.personal-notes.title',
        descriptionKey: 'premiumFeatures.features.personal-notes.description',
      },
      {
        id: 'release-reminders',
        icon: 'alarm-outline',
        titleKey: 'premiumFeatures.features.release-reminders.title',
        descriptionKey: 'premiumFeatures.features.release-reminders.description',
      },
    ],
  },
  {
    id: 'home-screen',
    titleKey: 'premiumFeatures.categories.home-screen',
    features: [
      {
        id: 'widgets',
        icon: 'apps-outline',
        titleKey: 'premiumFeatures.features.widgets.title',
        descriptionKey: 'premiumFeatures.features.widgets.description',
        isNew: true,
      },
      {
        id: 'latest-trailers',
        icon: 'videocam-outline',
        titleKey: 'premiumFeatures.features.latest-trailers.title',
        descriptionKey: 'premiumFeatures.features.latest-trailers.description',
      },
      {
        id: 'release-calendar',
        icon: 'calendar-outline',
        titleKey: 'premiumFeatures.features.release-calendar.title',
        descriptionKey: 'premiumFeatures.features.release-calendar.description',
      },
    ],
  },
  {
    id: 'discover',
    titleKey: 'premiumFeatures.categories.discover',
    features: [
      {
        id: 'streaming-filter',
        icon: 'play-circle',
        titleKey: 'premiumFeatures.features.streaming-filter.title',
        descriptionKey: 'premiumFeatures.features.streaming-filter.description',
      },
      {
        id: 'blur-spoilers',
        icon: 'eye-off-outline',
        titleKey: 'premiumFeatures.features.blur-spoilers.title',
        descriptionKey: 'premiumFeatures.features.blur-spoilers.description',
      },
      {
        id: 'hide-watched',
        icon: 'checkmark-circle-outline',
        titleKey: 'premiumFeatures.features.hide-watched.title',
        descriptionKey: 'premiumFeatures.features.hide-watched.description',
      },
    ],
  },
  {
    id: 'data',
    titleKey: 'premiumFeatures.categories.data',
    features: [
      {
        id: 'trakt-integration',
        icon: 'sync',
        titleKey: 'premiumFeatures.features.trakt-integration.title',
        descriptionKey: 'premiumFeatures.features.trakt-integration.description',
      },
      {
        id: 'export-data',
        icon: 'download-outline',
        titleKey: 'premiumFeatures.features.export-data.title',
        descriptionKey: 'premiumFeatures.features.export-data.description',
      },
    ],
  },
  {
    id: 'support',
    titleKey: 'premiumFeatures.categories.support',
    features: [
      {
        id: 'future-features',
        icon: 'sparkles',
        titleKey: 'premiumFeatures.features.future-features.title',
        descriptionKey: 'premiumFeatures.features.future-features.description',
      },
      {
        id: 'indie-support',
        icon: 'heart',
        titleKey: 'premiumFeatures.features.indie-support.title',
        descriptionKey: 'premiumFeatures.features.indie-support.description',
      },
    ],
  },
];
