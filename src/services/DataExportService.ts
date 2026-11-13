import { tmdbApi } from '@/src/api/tmdb';
import { auth, db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';
import { favoriteEpisodeService } from '@/src/services/FavoriteEpisodeService';
import { auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { ListMediaItem, listService } from '@/src/services/ListService';
import { noteService } from '@/src/services/NoteService';
import { normalizeRatingItem, type RatingItem } from '@/src/services/RatingService';
import type { TVShowEpisodeTracking, WatchedEpisode } from '@/src/types/episodeTracking';
import type { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { FavoritePerson } from '@/src/types/favoritePerson';
import type { Note } from '@/src/types/note';
import { raceWithTimeout } from '@/src/utils/timeout';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { collection } from 'firebase/firestore';

export type ExportFormat = 'csv' | 'markdown';

interface UserList {
  id: string;
  name: string;
  items: Record<string, ListMediaItem>;
}

interface EnrichedRating {
  rating: RatingItem;
  title: string;
}

type RawExportRating = Partial<RatingItem> & { id: string };

interface ExportData {
  lists: UserList[];
  enrichedRatings: EnrichedRating[];
  favoritePersons: FavoritePerson[];
  watchedShows: TVShowEpisodeTracking[];
  favoriteEpisodes: FavoriteEpisode[];
  notes: Note[];
}

/**
 * Fetch all user data directly from Firestore using audited one-time reads.
 */
async function fetchAllUserData(): Promise<
  Omit<ExportData, 'enrichedRatings'> & { ratings: RawExportRating[] }
> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const userId = user.uid;

  try {
    // Fetch all data in parallel using audited reads (no orderBy to avoid index requirements).
    // Episode tracking can spend up to 10s on the collection plus 10s on overflow pages.
    const [lists, ratingsSnapshot, favoritePersonsSnapshot, watchedShows, notes, favoriteEpisodes] =
      await raceWithTimeout(
        Promise.all([
          // Includes items in overflow pages of large lists.
          listService.fetchListsWithItems(userId, {
            queryKey: 'exportLists',
            callsite: 'DataExportService.fetchAllUserData',
          }),
          auditedGetDocs(collection(db, `users/${userId}/ratings`), {
            path: `users/${userId}/ratings`,
            queryKey: 'exportRatings',
            callsite: 'DataExportService.fetchAllUserData',
          }),
          auditedGetDocs(collection(db, `users/${userId}/favorite_persons`), {
            path: `users/${userId}/favorite_persons`,
            queryKey: 'exportFavoritePersons',
            callsite: 'DataExportService.fetchAllUserData',
          }),
          // Includes episodes in overflow pages of very long shows.
          episodeTrackingService.getAllWatchedShows(userId),
          noteService.getUserNotes(userId),
          favoriteEpisodeService.getFavoriteEpisodes(userId),
        ]),
        { ms: 20000 }
      );

    const ratings: RawExportRating[] = ratingsSnapshot.docs.map((doc) => {
      const data = doc.data();
      const storedId = typeof data.id === 'string' && data.id.trim() !== '' ? data.id : doc.id;
      return {
        ...data,
        id: storedId,
      } as RawExportRating;
    });

    const favoritePersons: FavoritePerson[] = favoritePersonsSnapshot.docs.map((doc) => ({
      id: Number(doc.id),
      ...doc.data(),
    })) as FavoritePerson[];

    return { lists, ratings, favoritePersons, watchedShows, notes, favoriteEpisodes };
  } catch (error) {
    const message = getFirestoreErrorMessage(error);
    console.error('[DataExportService] fetchAllUserData error:', message);
    throw new Error(message);
  }
}

/**
 * Fetch movie/TV details for ratings to get titles (with timeout protection)
 * Individual TMDB calls have 10s timeout, entire process has 30s global timeout
 */
async function enrichRatingsWithTitles(ratings: RawExportRating[]): Promise<EnrichedRating[]> {
  const validRatings = ratings
    .map((rating) =>
      normalizeRatingItem(rating, rating.id, 'DataExportService.enrichRatingsWithTitles')
    )
    .filter((rating): rating is RatingItem => rating !== null);

  const movieRatings = validRatings.filter((r) => r.mediaType === 'movie');
  const tvRatings = validRatings.filter((r) => r.mediaType === 'tv');
  const episodeRatings = validRatings.filter((r) => r.mediaType === 'episode');
  const seasonRatings = validRatings.filter((r) => r.mediaType === 'season');

  // Episodes already have metadata stored (no API calls needed)
  const episodeEnriched = episodeRatings.map((rating) => {
    const showName = rating.tvShowName || 'Unknown Show';
    const epName = rating.episodeName || `S${rating.seasonNumber}E${rating.episodeNumber}`;
    return { rating, title: `${showName} - ${epName}` };
  });
  const seasonEnriched = seasonRatings.map((rating) => {
    const showName = rating.tvShowName || 'Unknown Show';
    const seasonName = rating.title || `Season ${rating.seasonNumber ?? '?'}`;
    return { rating, title: `${showName} - ${seasonName}` };
  });

  // Fetch movie titles with timeout protection
  const moviePromises = movieRatings.map(async (rating) => {
    try {
      const movie = await raceWithTimeout(tmdbApi.getMovieDetails(parseInt(rating.id, 10)), {
        ms: 10000,
        message: `Timeout fetching movie ${rating.id}`,
      });
      return { rating, title: movie.title || `Movie ID: ${rating.id}` };
    } catch {
      return { rating, title: `Movie ID: ${rating.id}` };
    }
  });

  // Fetch TV show titles with timeout protection
  const tvPromises = tvRatings.map(async (rating) => {
    try {
      const tvShow = await raceWithTimeout(tmdbApi.getTVShowDetails(parseInt(rating.id, 10)), {
        ms: 10000,
        message: `Timeout fetching TV show ${rating.id}`,
      });
      return { rating, title: tvShow.name || `TV Show ID: ${rating.id}` };
    } catch {
      return { rating, title: `TV Show ID: ${rating.id}` };
    }
  });

  // Global 30-second timeout for entire enrichment process
  const [movieResults, tvResults] = await raceWithTimeout(
    Promise.all([Promise.all(moviePromises), Promise.all(tvPromises)]),
    { ms: 30000, message: 'Title enrichment timed out' }
  );

  return [...movieResults, ...tvResults, ...episodeEnriched, ...seasonEnriched];
}

/** Local calendar date as YYYY-MM-DD, or '' when the value isn't a usable timestamp. */
function formatDate(value: number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function episodeCode(season: number | undefined, episode: number | undefined): string {
  return `S${season ?? '?'}E${episode ?? '?'}`;
}

function ratingTypeLabel(mediaType: RatingItem['mediaType']): string {
  switch (mediaType) {
    case 'movie':
      return 'Movie';
    case 'tv':
      return 'TV';
    case 'season':
      return 'Season';
    default:
      return 'Episode';
  }
}

function noteTypeLabel(note: Note): string {
  switch (note.mediaType) {
    case 'movie':
      return 'Movie';
    case 'tv':
      return 'TV';
    case 'season':
      return `Season ${note.seasonNumber ?? '?'}`;
    default:
      return episodeCode(note.seasonNumber, note.episodeNumber);
  }
}

/** Shows sorted by name, each with its episodes sorted by season then episode. */
function sortedWatchedShows(
  watchedShows: TVShowEpisodeTracking[]
): { tvShowId: number | null; showName: string; episodes: WatchedEpisode[] }[] {
  return watchedShows
    .map((show) => {
      const episodes = Object.values(show.episodes || {}).sort(
        (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
      );
      return {
        tvShowId: episodes[0]?.tvShowId ?? null,
        showName: show.metadata?.tvShowName || 'Unknown Show',
        episodes,
      };
    })
    .filter((show) => show.episodes.length > 0)
    .sort((a, b) => a.showName.localeCompare(b.showName));
}

/** Rating ID for movies/TV is the TMDB ID; episodes/seasons use the show ID. */
function ratingTmdbId(rating: RatingItem): string {
  if (rating.mediaType === 'movie' || rating.mediaType === 'tv') return rating.id;
  return rating.tvShowId !== undefined ? String(rating.tvShowId) : '';
}

function generateMarkdown(data: ExportData): string {
  const { lists, enrichedRatings, favoritePersons, watchedShows, favoriteEpisodes, notes } = data;
  const shows = sortedWatchedShows(watchedShows);
  const watchedEpisodeCount = shows.reduce((sum, show) => sum + show.episodes.length, 0);
  const listItemCount = lists.reduce((sum, list) => sum + Object.keys(list.items || {}).length, 0);

  let md = '# ShowSeek Data Export\n\n';
  md += `_Exported on ${formatDate(Date.now())}_\n\n`;

  md += '## Summary\n\n';
  md += `- Lists: ${lists.length} (${listItemCount} items)\n`;
  md += `- Ratings: ${enrichedRatings.length}\n`;
  md += `- Watched episodes: ${watchedEpisodeCount} across ${shows.length} shows\n`;
  md += `- Favorite episodes: ${favoriteEpisodes.length}\n`;
  md += `- Notes: ${notes.length}\n`;
  md += `- Favorite people: ${favoritePersons.length}\n\n`;

  // 1. Lists
  md += '## Lists\n\n';
  if (lists.length > 0) {
    lists.forEach((list) => {
      md += `### ${list.name}\n`;
      const items = Object.values(list.items || {});
      if (items.length === 0) {
        md += '_No items_\n\n';
      } else {
        items.forEach((item) => {
          const title = item.title || item.name || 'Unknown';
          const type = listItemTypeLabel(item.media_type);
          const added = formatDate(item.addedAt);
          md += `- **${title}** (${type})${added ? ` – added ${added}` : ''}\n`;
        });
        md += '\n';
      }
    });
  } else {
    md += '_No lists found_\n\n';
  }

  // 2. Ratings
  md += '## Ratings\n\n';
  if (enrichedRatings.length > 0) {
    const groups: { heading: string; mediaType: RatingItem['mediaType'] }[] = [
      { heading: 'Movies', mediaType: 'movie' },
      { heading: 'TV Shows', mediaType: 'tv' },
      { heading: 'Episodes', mediaType: 'episode' },
      { heading: 'Seasons', mediaType: 'season' },
    ];
    groups.forEach(({ heading, mediaType }) => {
      const group = enrichedRatings.filter((r) => r.rating.mediaType === mediaType);
      if (group.length === 0) return;
      md += `### ${heading}\n`;
      group.forEach(({ rating, title }) => {
        const rated = formatDate(rating.ratedAt);
        md += `- **${title}**: ${rating.rating}/10${rated ? ` – rated ${rated}` : ''}\n`;
      });
      md += '\n';
    });
  } else {
    md += '_No ratings found_\n\n';
  }

  // 3. Watched Episodes
  md += '## Watched Episodes\n\n';
  if (shows.length > 0) {
    shows.forEach((show) => {
      md += `### ${show.showName}\n`;
      show.episodes.forEach((episode) => {
        const code = episodeCode(episode.seasonNumber, episode.episodeNumber);
        const name = episode.episodeName ? ` – ${episode.episodeName}` : '';
        const watched = formatDate(episode.watchedAt);
        md += `- ${code}${name}${watched ? ` (watched ${watched})` : ''}\n`;
      });
      md += '\n';
    });
  } else {
    md += '_No watched episodes found_\n\n';
  }

  // 4. Favorite Episodes
  md += '## Favorite Episodes\n\n';
  if (favoriteEpisodes.length > 0) {
    favoriteEpisodes.forEach((episode) => {
      const code = episodeCode(episode.seasonNumber, episode.episodeNumber);
      const name = episode.episodeName ? ` ${episode.episodeName}` : '';
      md += `- **${episode.showName || 'Unknown Show'}** – ${code}${name}\n`;
    });
    md += '\n';
  } else {
    md += '_No favorite episodes found_\n\n';
  }

  // 5. Notes
  md += '## Notes\n\n';
  if (notes.length > 0) {
    notes.forEach((note) => {
      md += `### ${note.mediaTitle || 'Unknown'} (${noteTypeLabel(note)})\n`;
      const updated = formatDate(note.updatedAt);
      if (updated) md += `_Last updated ${updated}_\n\n`;
      md += `${note.content}\n\n`;
    });
  } else {
    md += '_No notes found_\n\n';
  }

  // 6. Favorite People
  md += '## Favorite People\n\n';
  if (favoritePersons.length > 0) {
    favoritePersons.forEach((person) => {
      md += `- **${person.name}**\n`;
    });
    md += '\n';
  } else {
    md += '_No favorite people found_\n\n';
  }

  return md;
}

const CSV_HEADER = 'Category,Title,Type,Rating,Date,TMDB ID,Season,Episode,Note';

function escapeCsv(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

interface CsvRow {
  category: string;
  title: string;
  type: string;
  rating?: number;
  date?: string;
  tmdbId?: string | number;
  season?: number;
  episode?: number;
  note?: string;
}

function csvLine(row: CsvRow): string {
  return [
    row.category,
    row.title,
    row.type,
    row.rating,
    row.date,
    row.tmdbId,
    row.season,
    row.episode,
    row.note,
  ]
    .map(escapeCsv)
    .join(',');
}

function listItemTypeLabel(mediaType: ListMediaItem['media_type']): string {
  if (mediaType === 'movie') return 'Movie';
  if (mediaType === 'season') return 'Season';
  return 'TV';
}

function generateCSV(data: ExportData): string {
  const { lists, enrichedRatings, favoritePersons, watchedShows, favoriteEpisodes, notes } = data;
  const rows: CsvRow[] = [];

  // 1. Lists
  lists.forEach((list) => {
    Object.values(list.items || {}).forEach((item) => {
      rows.push({
        category: `List: ${list.name}`,
        title: item.title || item.name || 'Unknown',
        type: listItemTypeLabel(item.media_type),
        date: formatDate(item.addedAt),
        // For a season this is the show's TMDB ID, with the season number alongside.
        tmdbId: item.id,
        season: item.media_type === 'season' ? item.season_number : undefined,
      });
    });
  });

  // 2. Ratings
  enrichedRatings.forEach(({ rating, title }) => {
    rows.push({
      category: 'Rating',
      title,
      type: ratingTypeLabel(rating.mediaType),
      rating: rating.rating,
      date: formatDate(rating.ratedAt),
      tmdbId: ratingTmdbId(rating),
      season: rating.seasonNumber,
      episode: rating.episodeNumber,
    });
  });

  // 3. Watched Episodes
  sortedWatchedShows(watchedShows).forEach((show) => {
    show.episodes.forEach((episode) => {
      rows.push({
        category: 'Watched Episode',
        title: episode.episodeName ? `${show.showName} - ${episode.episodeName}` : show.showName,
        type: 'Episode',
        date: formatDate(episode.watchedAt),
        tmdbId: episode.tvShowId,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
      });
    });
  });

  // 4. Favorite Episodes
  favoriteEpisodes.forEach((episode) => {
    const showName = episode.showName || 'Unknown Show';
    rows.push({
      category: 'Favorite Episode',
      title: episode.episodeName ? `${showName} - ${episode.episodeName}` : showName,
      type: 'Episode',
      date: formatDate(episode.addedAt),
      tmdbId: episode.tvShowId,
      season: episode.seasonNumber,
      episode: episode.episodeNumber,
    });
  });

  // 5. Notes
  notes.forEach((note) => {
    const isShowChild = note.mediaType === 'season' || note.mediaType === 'episode';
    rows.push({
      category: 'Note',
      title: note.mediaTitle || 'Unknown',
      type: ratingTypeLabel(note.mediaType),
      date: formatDate(note.updatedAt),
      tmdbId: isShowChild ? (note.showId ?? note.mediaId) : note.mediaId,
      season: note.seasonNumber,
      episode: note.episodeNumber,
      note: note.content,
    });
  });

  // 6. Favorite Persons
  favoritePersons.forEach((person) => {
    rows.push({
      category: 'Favorite Person',
      title: person.name,
      type: 'Person',
      tmdbId: person.id,
    });
  });

  return `${CSV_HEADER}\n${rows.map(csvLine).join('\n')}${rows.length > 0 ? '\n' : ''}`;
}

/**
 * Export user data - called on-demand
 */
export async function exportUserData(format: ExportFormat): Promise<void> {
  try {
    const { ratings, ...rest } = await fetchAllUserData();

    // Enrich ratings with titles
    const enrichedRatings = await enrichRatingsWithTitles(ratings);
    const data: ExportData = { ...rest, enrichedRatings };

    const content = format === 'markdown' ? generateMarkdown(data) : generateCSV(data);

    const extension = format === 'markdown' ? 'md' : 'csv';
    const filename = `showseek_export_${formatDate(Date.now())}.${extension}`;

    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: format === 'markdown' ? 'text/markdown' : 'text/csv',
        dialogTitle: `Export Data as ${format.toUpperCase()}`,
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
}
