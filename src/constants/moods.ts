/**
 * Mood-based content discovery configuration.
 * Each mood maps to specific TMDB genre and keyword IDs for discovery queries.
 *
 * IMPORTANT: TMDB uses DIFFERENT genre IDs for Movies vs TV Shows!
 *
 * MOVIE Genre IDs:
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
 * TV Genre IDs (different from movies!):
 * - 10759: Action & Adventure (replaces Action + Adventure)
 * - 16: Animation (same)
 * - 35: Comedy (same)
 * - 18: Drama (same)
 * - 10751: Family (same)
 * - 9648: Mystery (same)
 * - 10765: Sci-Fi & Fantasy (replaces Sci-Fi + Fantasy)
 * - 10768: War & Politics
 * - 37: Western (same)
 *
 * Note: Horror, Thriller, Romance do NOT exist as TV genres on TMDB!
 * For TV: use keywords + Drama/Mystery genres to approximate.
 *
 * TMDB Keyword IDs are shared between Movies and TV.
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
  /** TMDB genre IDs for MOVIES (pipe-separated = OR logic) */
  movieGenres: number[];
  /** TMDB genre IDs for TV SHOWS (pipe-separated = OR logic) */
  tvGenres: number[];
  /** TMDB keyword IDs to include (pipe-separated = OR logic, shared for both) */
  keywords: number[];
  /** TMDB genre IDs to exclude for MOVIES (optional) */
  movieExcludeGenres?: number[];
  /** TMDB genre IDs to exclude for TV SHOWS (optional) */
  tvExcludeGenres?: number[];
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
    movieGenres: [35, 10751], // Comedy, Family
    tvGenres: [35, 10751], // Comedy, Family (same IDs)
    keywords: [
      9717, // feel-good
      155714, // heartwarming
      6054, // friendship
      9799, // romantic comedy
    ],
    movieExcludeGenres: [27, 53], // Exclude Horror, Thriller
    tvExcludeGenres: [], // TV doesn't have Horror/Thriller genres
  },
  {
    id: 'mindBending',
    translationKey: 'mood.mindBending',
    emoji: '🌀',
    icon: Brain,
    color: '#9B59B6', // Purple
    movieGenres: [9648, 878], // Mystery, Science Fiction
    tvGenres: [9648, 10765], // Mystery, Sci-Fi & Fantasy
    keywords: [
      275311, // plot twist
      10349, // psychological
      1721, // dream
      156277, // mind control
      11019, // paranoia
    ],
    movieExcludeGenres: [],
    tvExcludeGenres: [],
  },
  {
    id: 'adrenaline',
    translationKey: 'mood.adrenaline',
    emoji: '⚡',
    icon: Zap,
    color: '#E74C3C', // Red
    movieGenres: [28, 12], // Action, Adventure
    tvGenres: [10759], // Action & Adventure (TV-specific genre)
    keywords: [
      1308, // survival
      1562, // escape
      14819, // mission
      9748, // revenge
      14601, // explosion
    ],
    movieExcludeGenres: [],
    tvExcludeGenres: [],
  },
  {
    id: 'heartbreaking',
    translationKey: 'mood.heartbreaking',
    emoji: '💔',
    icon: Heart,
    color: '#3498DB', // Blue
    movieGenres: [18, 10749], // Drama, Romance
    tvGenres: [18], // Drama (Romance doesn't exist for TV)
    keywords: [
      6270, // tragedy
      4336, // death
      10683, // coming of age
      5216, // love
      9672, // based on true story
    ],
    movieExcludeGenres: [35], // Exclude Comedy
    tvExcludeGenres: [35], // Exclude Comedy
  },
  {
    id: 'spooky',
    translationKey: 'mood.spooky',
    emoji: '👻',
    icon: Ghost,
    color: '#1A1A2E', // Dark purple/navy
    movieGenres: [27, 53], // Horror, Thriller
    tvGenres: [9648], // Mystery (Horror/Thriller don't exist for TV)
    keywords: [
      162846, // supernatural
      10224, // haunting
      3133, // ghost
      12339, // possession
      224636, // paranormal
    ],
    movieExcludeGenres: [],
    tvExcludeGenres: [35], // Exclude Comedy for TV
  },
  {
    id: 'whimsical',
    translationKey: 'mood.whimsical',
    emoji: '✨',
    icon: Sparkles,
    color: '#F39C12', // Gold
    movieGenres: [14, 16], // Fantasy, Animation
    tvGenres: [10765, 16], // Sci-Fi & Fantasy, Animation
    keywords: [
      2343, // magic
      4344, // fairy tale
      177912, // magical realism
      1826, // fantasy world
      3205, // witch
    ],
    movieExcludeGenres: [27], // Exclude Horror
    tvExcludeGenres: [], // No Horror genre for TV
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
 * Format mood genres for TMDB API based on media type.
 * Uses OR logic (pipe-separated) - matches content with ANY of the genres.
 */
export function formatMoodGenres(mood: MoodConfig, mediaType: 'movie' | 'tv'): string {
  const genres = mediaType === 'movie' ? mood.movieGenres : mood.tvGenres;
  return genres.join('|');
}

/**
 * Format mood keywords for TMDB API (pipe-separated for OR logic).
 */
export function formatMoodKeywords(mood: MoodConfig): string {
  return mood.keywords.join('|');
}

/**
 * Format excluded genres for TMDB API based on media type (comma-separated).
 */
export function formatExcludedGenres(
  mood: MoodConfig,
  mediaType: 'movie' | 'tv'
): string | undefined {
  const excludeGenres = mediaType === 'movie' ? mood.movieExcludeGenres : mood.tvExcludeGenres;
  if (!excludeGenres || excludeGenres.length === 0) {
    return undefined;
  }
  return excludeGenres.join(',');
}
