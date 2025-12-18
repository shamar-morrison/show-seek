import { tmdbApi } from '@/src/api/tmdb';
import { auth, db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { ListMediaItem } from '@/src/services/ListService';
import { RatingItem } from '@/src/services/RatingService';
import { FavoritePerson } from '@/src/types/favoritePerson';
import { createTimeout } from '@/src/utils/timeout';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { collection, getDocs } from 'firebase/firestore';

type ExportFormat = 'csv' | 'markdown';

interface UserList {
  id: string;
  name: string;
  items: Record<string, ListMediaItem>;
}

interface EnrichedRating {
  rating: RatingItem;
  title: string;
}

/**
 * Fetch all user data directly from Firestore using getDocs (one-time fetch)
 */
async function fetchAllUserData(): Promise<{
  lists: UserList[];
  ratings: RatingItem[];
  favoritePersons: FavoritePerson[];
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const userId = user.uid;

  try {
    // 10 second timeout
    const timeoutPromise = createTimeout(10000);

    // Fetch all data in parallel using getDocs (no orderBy to avoid index requirements)
    const [listsSnapshot, ratingsSnapshot, favoritePersonsSnapshot] = await Promise.race([
      Promise.all([
        getDocs(collection(db, `users/${userId}/lists`)),
        getDocs(collection(db, `users/${userId}/ratings`)),
        getDocs(collection(db, `users/${userId}/favorite_persons`)),
      ]),
      timeoutPromise,
    ]);

    const lists: UserList[] = listsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as UserList[];

    const ratings: RatingItem[] = ratingsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as RatingItem[];

    const favoritePersons: FavoritePerson[] = favoritePersonsSnapshot.docs.map((doc) => ({
      id: Number(doc.id),
      ...doc.data(),
    })) as FavoritePerson[];

    return { lists, ratings, favoritePersons };
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
async function enrichRatingsWithTitles(ratings: RatingItem[]): Promise<EnrichedRating[]> {
  const movieRatings = ratings.filter((r) => r.mediaType === 'movie');
  const tvRatings = ratings.filter((r) => r.mediaType === 'tv');
  const episodeRatings = ratings.filter((r) => r.mediaType === 'episode');

  // Episodes already have metadata stored (no API calls needed)
  const episodeEnriched = episodeRatings.map((rating) => {
    const showName = rating.tvShowName || 'Unknown Show';
    const epName = rating.episodeName || `S${rating.seasonNumber}E${rating.episodeNumber}`;
    return { rating, title: `${showName} - ${epName}` };
  });

  // Fetch movie titles with timeout protection
  const moviePromises = movieRatings.map(async (rating) => {
    try {
      const movie = await Promise.race([
        tmdbApi.getMovieDetails(parseInt(rating.id, 10)),
        createTimeout(10000, `Timeout fetching movie ${rating.id}`),
      ]);
      return { rating, title: movie.title || `Movie ID: ${rating.id}` };
    } catch {
      return { rating, title: `Movie ID: ${rating.id}` };
    }
  });

  // Fetch TV show titles with timeout protection
  const tvPromises = tvRatings.map(async (rating) => {
    try {
      const tvShow = await Promise.race([
        tmdbApi.getTVShowDetails(parseInt(rating.id, 10)),
        createTimeout(10000, `Timeout fetching TV show ${rating.id}`),
      ]);
      return { rating, title: tvShow.name || `TV Show ID: ${rating.id}` };
    } catch {
      return { rating, title: `TV Show ID: ${rating.id}` };
    }
  });

  // Global 30-second timeout for entire enrichment process
  const [movieResults, tvResults] = await Promise.race([
    Promise.all([Promise.all(moviePromises), Promise.all(tvPromises)]),
    createTimeout(30000, 'Title enrichment timed out'),
  ]);

  return [...movieResults, ...tvResults, ...episodeEnriched];
}

function generateMarkdown(
  lists: UserList[],
  enrichedRatings: EnrichedRating[],
  favoritePersons: FavoritePerson[]
): string {
  let md = '# ShowSeek Data Export\n\n';
  md += `_Exported on ${new Date().toLocaleDateString()}_\n\n`;

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
          const type = item.media_type === 'movie' ? 'Movie' : 'TV';
          md += `- **${title}** (${type})\n`;
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
    const movieRatings = enrichedRatings.filter((r) => r.rating.mediaType === 'movie');
    const tvRatings = enrichedRatings.filter((r) => r.rating.mediaType === 'tv');
    const episodeRatings = enrichedRatings.filter((r) => r.rating.mediaType === 'episode');

    if (movieRatings.length > 0) {
      md += '### Movies\n';
      movieRatings.forEach(({ rating, title }) => {
        md += `- **${title}**: ${rating.rating}/10\n`;
      });
      md += '\n';
    }
    if (tvRatings.length > 0) {
      md += '### TV Shows\n';
      tvRatings.forEach(({ rating, title }) => {
        md += `- **${title}**: ${rating.rating}/10\n`;
      });
      md += '\n';
    }
    if (episodeRatings.length > 0) {
      md += '### Episodes\n';
      episodeRatings.forEach(({ rating, title }) => {
        md += `- **${title}**: ${rating.rating}/10\n`;
      });
      md += '\n';
    }
  } else {
    md += '_No ratings found_\n\n';
  }

  // 3. Favorite People
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

function generateCSV(
  lists: UserList[],
  enrichedRatings: EnrichedRating[],
  favoritePersons: FavoritePerson[]
): string {
  let csv = 'Category,Title,Type,Rating\n';

  const escapeCsv = (str: string | undefined | null) => {
    if (!str) return '';
    const stringValue = String(str);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // 1. Lists
  lists.forEach((list) => {
    Object.values(list.items || {}).forEach((item) => {
      const title = item.title || item.name || 'Unknown';
      const type = item.media_type === 'movie' ? 'Movie' : 'TV';
      csv += `${escapeCsv('List: ' + list.name)},${escapeCsv(title)},${type},\n`;
    });
  });

  // 2. Ratings
  enrichedRatings.forEach(({ rating, title }) => {
    const type =
      rating.mediaType === 'movie' ? 'Movie' : rating.mediaType === 'tv' ? 'TV' : 'Episode';
    csv += `Rating,${escapeCsv(title)},${type},${rating.rating}\n`;
  });

  // 3. Favorite Persons
  favoritePersons.forEach((person) => {
    csv += `Favorite Person,${escapeCsv(person.name)},Person,\n`;
  });

  return csv;
}

/**
 * Export user data - called on-demand
 */
export async function exportUserData(format: ExportFormat): Promise<void> {
  try {
    // Fetch all data using getDocs
    const { lists, ratings, favoritePersons } = await fetchAllUserData();

    // Enrich ratings with titles
    const enrichedRatings = await enrichRatingsWithTitles(ratings);

    // Generate content
    const content =
      format === 'markdown'
        ? generateMarkdown(lists, enrichedRatings, favoritePersons)
        : generateCSV(lists, enrichedRatings, favoritePersons);

    const extension = format === 'markdown' ? 'md' : 'csv';
    const filename = `showseek_export.${extension}`;

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
