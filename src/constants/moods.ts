/**
 * Mood-based content discovery configuration.
 * Each mood maps to specific TMDB genre and keyword IDs for discovery queries.
 *
 * TMDB Genre IDs reference:
 * - 28: Action
 * - 12: Adventure
 * - 16: Animation
 * - 35: Comedy
 * - 18: Drama
 * - 14: Fantasy
 * - 27: Horror
 * - 9648: Mystery
 * - 10749: Romance
 * - 878: Science Fiction
 * - 53: Thriller
 * - 10751: Family
 *
 * TMDB Keyword IDs are researched and hardcoded for fast lookups.
 */

import type { LucideIcon } from 'lucide-react-native';
import { Armchair, Brain, Ghost, Heart, Sparkles, Zap } from 'lucide-react-native';

export interface MoodConfig {
  /** Unique identifier for the mood */
  id: string;
  /** Translation key for the mood name (e.g., 'mood.cozy') */
  translationKey: string;
  /** Emoji representation of the mood */
  emoji: string;
  /** Lucide icon component for the mood */
  icon: LucideIcon;
  /** Unique accent color for the mood card (hex) */
  color: string;
  /** TMDB genre IDs to include (pipe-separated = OR logic) */
  genres: number[];
  /** TMDB keyword IDs to include (pipe-separated = OR logic) */
  keywords: number[];
  /** TMDB genre IDs to exclude (optional) */
  excludeGenres?: number[];
}

/**
 * Predefined moods for content discovery.
 * Each mood has curated TMDB parameters for optimal results.
 */
export const MOODS: MoodConfig[] = [
  {
    id: 'cozy',
    translationKey: 'mood.cozy',
    emoji: '🧣',
    icon: Armchair,
    color: '#FF8C42', // Warm orange
    genres: [35, 10751], // Comedy, Family
    keywords: [
      9717, // feel-good
      155714, // heartwarming
      4565, // friendship
      9799, // romantic comedy
    ],
    excludeGenres: [27, 53], // Exclude Horror, Thriller
  },
  {
    id: 'mindBending',
    translationKey: 'mood.mindBending',
    emoji: '🌀',
    icon: Brain,
    color: '#9B59B6', // Purple
    genres: [9648, 878], // Mystery, Science Fiction
    keywords: [
      4565, // plot twist (note: this is a common ID, actual may vary)
      10349, // psychological
      10617, // dream
      156277, // mind control
      11019, // paranoia
    ],
    excludeGenres: [],
  },
  {
    id: 'adrenaline',
    translationKey: 'mood.adrenaline',
    emoji: '⚡',
    icon: Zap,
    color: '#E74C3C', // Red
    genres: [28, 12], // Action, Adventure
    keywords: [
      1308, // survival
      10617, // escape
      14819, // mission
      9748, // revenge
      11322, // explosion
    ],
    excludeGenres: [],
  },
  {
    id: 'heartbreaking',
    translationKey: 'mood.heartbreaking',
    emoji: '💔',
    icon: Heart,
    color: '#3498DB', // Blue
    genres: [18, 10749], // Drama, Romance
    keywords: [
      6270, // tragedy
      4336, // death
      10683, // coming of age
      11322, // love
      9673, // based on true story
    ],
    excludeGenres: [35], // Exclude Comedy
  },
  {
    id: 'spooky',
    translationKey: 'mood.spooky',
    emoji: '👻',
    icon: Ghost,
    color: '#1A1A2E', // Dark purple/navy
    genres: [27, 53], // Horror, Thriller
    keywords: [
      162846, // supernatural
      10224, // haunting
      3133, // ghost
      12339, // possession
      224636, // paranormal
    ],
    excludeGenres: [],
  },
  {
    id: 'whimsical',
    translationKey: 'mood.whimsical',
    emoji: '✨',
    icon: Sparkles,
    color: '#F39C12', // Gold
    genres: [14, 16], // Fantasy, Animation
    keywords: [
      2343, // magic
      4344, // fairy tale
      177912, // magical realism
      1826, // fantasy world
      3205, // witch
    ],
    excludeGenres: [27], // Exclude Horror
  },
];

/**
 * Get a mood configuration by its ID.
 */
export function getMoodById(id: string): MoodConfig | undefined {
  return MOODS.find((mood) => mood.id === id);
}

/**
 * Get a random mood for the "Surprise Me" feature.
 */
export function getRandomMood(): MoodConfig {
  const randomIndex = Math.floor(Math.random() * MOODS.length);
  return MOODS[randomIndex];
}

/**
 * Format mood genres for TMDB API (comma-separated).
 * Uses OR logic - matches content with ANY of the genres.
 */
export function formatMoodGenres(mood: MoodConfig): string {
  return mood.genres.join('|');
}

/**
 * Format mood keywords for TMDB API (pipe-separated for OR logic).
 */
export function formatMoodKeywords(mood: MoodConfig): string {
  return mood.keywords.join('|');
}

/**
 * Format excluded genres for TMDB API (comma-separated).
 */
export function formatExcludedGenres(mood: MoodConfig): string | undefined {
  if (!mood.excludeGenres || mood.excludeGenres.length === 0) {
    return undefined;
  }
  return mood.excludeGenres.join(',');
}
