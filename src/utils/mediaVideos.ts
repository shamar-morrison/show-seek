import type { Video } from '@/src/api/tmdb';
import { buildIncludeImageLanguage } from '@/src/utils/mediaImages';

/**
 * The `include_video_language` value for a TMDB `/videos` request: the app language, English as a
 * fallback, and videos with no language. With `language` alone TMDB returns only videos in that
 * language, so a French app showed Game of Thrones with 3 videos instead of 10.
 */
export const buildIncludeVideoLanguage = buildIncludeImageLanguage;

/** TMDB's video types in the order their tabs appear. Other types follow, in the order seen. */
export const VIDEO_TYPE_ORDER = [
  'Trailer',
  'Teaser',
  'Clip',
  'Featurette',
  'Behind the Scenes',
  'Bloopers',
  'Opening Credits',
] as const;

/** Strings for each known type, under `media.videoTypes.<key>`. */
export const VIDEO_TYPE_LABEL_KEYS: Record<string, string> = {
  Trailer: 'trailers',
  Teaser: 'teasers',
  Clip: 'clips',
  Featurette: 'featurettes',
  'Behind the Scenes': 'behindTheScenes',
  Bloopers: 'bloopers',
  'Opening Credits': 'openingCredits',
};

/**
 * Sorts a title's videos for the app language and drops the ones the player can't play (it only
 * plays YouTube). Videos in the app language come first, then English, then any others; within
 * each, official videos first, then newest first.
 */
export function organizeVideos(videos: Video[], appLanguage: string): Video[] {
  const language = appLanguage.split('-')[0]?.toLowerCase() || 'en';
  const languageRank = (video: Video) =>
    video.iso_639_1 === language ? 0 : video.iso_639_1 === 'en' ? 1 : 2;
  const publishedAt = (video: Video) => (video.published_at ? Date.parse(video.published_at) : 0);

  const seen = new Set<string>();
  return (videos ?? [])
    .filter((video) => {
      if (video.site !== 'YouTube' || !video.key || seen.has(video.key)) return false;
      seen.add(video.key);
      return true;
    })
    .sort(
      (a, b) =>
        languageRank(a) - languageRank(b) ||
        Number(!!b.official) - Number(!!a.official) ||
        publishedAt(b) - publishedAt(a)
    );
}

export interface VideoTypeGroup {
  /** TMDB's type, e.g. "Behind the Scenes". */
  type: string;
  videos: Video[];
}

/** Videos grouped by type, known types in VIDEO_TYPE_ORDER, empty groups left out. */
export function groupVideosByType(videos: Video[]): VideoTypeGroup[] {
  const groups = new Map<string, Video[]>();
  for (const video of videos) {
    const type = video.type || 'Other';
    groups.set(type, [...(groups.get(type) ?? []), video]);
  }
  const rank = (type: string) => {
    const index = (VIDEO_TYPE_ORDER as readonly string[]).indexOf(type);
    return index === -1 ? VIDEO_TYPE_ORDER.length : index;
  };
  return Array.from(groups, ([type, groupVideos]) => ({ type, videos: groupVideos })).sort(
    (a, b) => rank(a.type) - rank(b.type)
  );
}
