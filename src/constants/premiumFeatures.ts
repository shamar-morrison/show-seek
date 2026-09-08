import {
  AlarmClockIcon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  DashboardSquare03Icon,
  Download01Icon,
  FavouriteIcon,
  File01Icon,
  Infinity01Icon,
  Menu01Icon,
  RefreshIcon,
  Tv01Icon,
  UserAiIcon,
  Video01Icon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';

export interface PremiumFeature {
  /** Unique identifier for the feature */
  id: string;
  /** HugeIcons icon data */
  icon: IconSvgElement;
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
        icon: Menu01Icon,
        titleKey: 'premiumFeatures.features.unlimited-lists.title',
        descriptionKey: 'premiumFeatures.features.unlimited-lists.description',
      },
      {
        id: 'unlimited-items',
        icon: Infinity01Icon,
        titleKey: 'premiumFeatures.features.unlimited-items.title',
        descriptionKey: 'premiumFeatures.features.unlimited-items.description',
      },
      {
        id: 'personal-notes',
        icon: File01Icon,
        titleKey: 'premiumFeatures.features.personal-notes.title',
        descriptionKey: 'premiumFeatures.features.personal-notes.description',
      },
      {
        id: 'release-reminders',
        icon: AlarmClockIcon,
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
        icon: DashboardSquare03Icon,
        titleKey: 'premiumFeatures.features.widgets.title',
        descriptionKey: 'premiumFeatures.features.widgets.description',
        isNew: true,
      },
      {
        id: 'latest-trailers',
        icon: Video01Icon,
        titleKey: 'premiumFeatures.features.latest-trailers.title',
        descriptionKey: 'premiumFeatures.features.latest-trailers.description',
      },
      {
        id: 'release-calendar',
        icon: Calendar03Icon,
        titleKey: 'premiumFeatures.features.release-calendar.title',
        descriptionKey: 'premiumFeatures.features.release-calendar.description',
      },
      {
        id: 'where-to-watch',
        icon: Tv01Icon,
        titleKey: 'premiumFeatures.features.where-to-watch.title',
        descriptionKey: 'premiumFeatures.features.where-to-watch.description',
        isNew: true,
      },
    ],
  },
  {
    id: 'discover',
    titleKey: 'premiumFeatures.categories.discover',
    features: [
      {
        id: 'blur-spoilers',
        icon: ViewOffIcon,
        titleKey: 'premiumFeatures.features.blur-spoilers.title',
        descriptionKey: 'premiumFeatures.features.blur-spoilers.description',
      },
      {
        id: 'hide-watched',
        icon: CheckmarkCircle02Icon,
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
        icon: RefreshIcon,
        titleKey: 'premiumFeatures.features.trakt-integration.title',
        descriptionKey: 'premiumFeatures.features.trakt-integration.description',
      },
      {
        id: 'export-data',
        icon: Download01Icon,
        titleKey: 'premiumFeatures.features.export-data.title',
        descriptionKey: 'premiumFeatures.features.export-data.description',
      },
      {
        id: 'import-imdb',
        icon: CloudUploadIcon,
        titleKey: 'premiumFeatures.features.import-imdb.title',
        descriptionKey: 'premiumFeatures.features.import-imdb.description',
        isNew: true,
      },
    ],
  },
  {
    id: 'support',
    titleKey: 'premiumFeatures.categories.support',
    features: [
      {
        id: 'future-features',
        icon: UserAiIcon,
        titleKey: 'premiumFeatures.features.future-features.title',
        descriptionKey: 'premiumFeatures.features.future-features.description',
      },
      {
        id: 'indie-support',
        icon: FavouriteIcon,
        titleKey: 'premiumFeatures.features.indie-support.title',
        descriptionKey: 'premiumFeatures.features.indie-support.description',
      },
    ],
  },
];
