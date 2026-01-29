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
  /** Display title */
  title: string;
  /** Optional short description */
  description?: string;
  /** Show "NEW" badge if true */
  isNew?: boolean;
}

/**
 * Represents a category grouping of premium features
 */
export interface PremiumCategory {
  /** Unique identifier for the category */
  id: string;
  /** Category display title */
  title: string;
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
    title: 'Lists & Organization',
    features: [
      {
        id: 'unlimited-lists',
        icon: 'list',
        title: 'Unlimited Custom Lists',
        description: 'Create as many lists as you need',
      },
      {
        id: 'unlimited-items',
        icon: 'infinite',
        title: 'Unlimited Items per List',
        description: 'No cap on items in each list',
      },
      {
        id: 'personal-notes',
        icon: 'document-text-outline',
        title: 'Personal Notes',
        description: 'Add notes to movies and TV shows',
      },
      {
        id: 'release-reminders',
        icon: 'alarm-outline',
        title: 'Release Reminders',
        description: 'Get notified when new episodes air',
      },
    ],
  },
  {
    id: 'home-screen',
    title: 'Home Screen',
    features: [
      {
        id: 'widgets',
        icon: 'apps-outline',
        title: 'Home Screen Widgets',
        description: "Add widgets to your phone's home screen",
        isNew: true,
      },
      {
        id: 'latest-trailers',
        icon: 'videocam-outline',
        title: 'Latest Trailers',
        description: 'Add the latest TMDB trailers to your home screen in-app',
      },
      {
        id: 'release-calendar',
        icon: 'calendar-outline',
        title: 'Release Calendar',
        description: 'Track upcoming episodes and movies',
      },
    ],
  },
  {
    id: 'discover',
    title: 'Discover & Browse',
    features: [
      {
        id: 'streaming-filter',
        icon: 'play-circle',
        title: 'Filter by Streaming Service',
        description: 'Find content on your favorite platforms',
      },
      {
        id: 'blur-spoilers',
        icon: 'eye-off-outline',
        title: 'Blur Plot Spoilers',
        description: "Avoid spoilers until you're ready",
      },
      {
        id: 'hide-watched',
        icon: 'checkmark-circle-outline',
        title: 'Hide Watched Content',
        description: 'Keep your browsing fresh',
      },
    ],
  },
  {
    id: 'data',
    title: 'Data & Sync',
    features: [
      {
        id: 'trakt-integration',
        icon: 'sync',
        title: 'Trakt Integration',
        description: 'Sync your watch history and lists',
      },
      {
        id: 'export-data',
        icon: 'download-outline',
        title: 'Export Your Data',
        description: 'Download your lists and watch history',
      },
    ],
  },
  {
    id: 'support',
    title: 'Support & Future',
    features: [
      {
        id: 'future-features',
        icon: 'sparkles',
        title: 'Access to Future Premium Features',
        description: 'Get new features as they launch',
      },
      {
        id: 'indie-support',
        icon: 'heart',
        title: 'Support Indie Development',
        description: 'Help keep the app growing',
      },
    ],
  },
];
