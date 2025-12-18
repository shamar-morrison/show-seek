import { useEnrichedMovieRatings, useEnrichedTVRatings } from '@/src/hooks/useEnrichedRatings';
import { useFavoritePersons } from '@/src/hooks/useFavoritePersons';
import { useFavorites } from '@/src/hooks/useFirestore';
import { useLists } from '@/src/hooks/useLists';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

type ExportFormat = 'csv' | 'markdown';

export const useDataExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  // Data Hooks
  const { data: lists } = useLists();
  const { data: enrichedMovieRatings } = useEnrichedMovieRatings();
  const { data: enrichedTVRatings } = useEnrichedTVRatings();
  const { data: favoritePersons } = useFavoritePersons();
  const { favorites: favoriteContent } = useFavorites();

  const generateMarkdown = useCallback(() => {
    let md = '# ShowSeek Data Export\n\n';

    // 1. Lists
    md += '## Lists\n\n';
    if (lists && lists.length > 0) {
      lists.forEach((list) => {
        md += `### ${list.name}\n`;
        const items = Object.values(list.items || {});
        if (items.length === 0) {
          md += '_No items_\n\n';
        } else {
          items.forEach((item) => {
            md += `- **${item.title || item.name}** (${item.media_type === 'movie' ? 'Movie' : 'TV'}) - Added: ${new Date(item.addedAt).toLocaleDateString()}\n`;
          });
          md += '\n';
        }
      });
    } else {
      md += '_No lists found_\n\n';
    }

    // 2. Ratings
    md += '## Ratings\n\n';
    if (
      (enrichedMovieRatings && enrichedMovieRatings.length > 0) ||
      (enrichedTVRatings && enrichedTVRatings.length > 0)
    ) {
      if (enrichedMovieRatings && enrichedMovieRatings.length > 0) {
        md += '### Movies\n';
        enrichedMovieRatings.forEach(({ rating, movie }) => {
          md += `- **${movie?.title || 'Unknown Title'}**: ${rating.rating}/10\n`;
        });
        md += '\n';
      }
      if (enrichedTVRatings && enrichedTVRatings.length > 0) {
        md += '### TV Shows\n';
        enrichedTVRatings.forEach(({ rating, tvShow }) => {
          md += `- **${tvShow?.name || 'Unknown Title'}**: ${rating.rating}/10\n`;
        });
        md += '\n';
      }
    } else {
      md += '_No ratings found_\n\n';
    }

    // 3. Favorite Content (Movies/TV)
    md += '## Favorite Content\n\n';
    if (favoriteContent && favoriteContent.length > 0) {
      favoriteContent.forEach((item) => {
        md += `- **${item.title}** (${item.mediaType === 'movie' ? 'Movie' : 'TV'}) - Added: ${new Date(item.addedAt).toLocaleDateString()}\n`;
      });
      md += '\n';
    } else {
      md += '_No favorite content found_\n\n';
    }

    // 4. Favorite People
    md += '## Favorite People\n\n';
    if (favoritePersons && favoritePersons.length > 0) {
      favoritePersons.forEach((person) => {
        md += `- **${person.name}**\n`;
      });
      md += '\n';
    } else {
      md += '_No favorite people found_\n\n';
    }

    return md;
  }, [lists, enrichedMovieRatings, enrichedTVRatings, favoriteContent, favoritePersons]);

  const generateCSV = useCallback(() => {
    // Columns: Category, Title, Type, Rating, Date Added, Notes
    let csv = 'Category,Title,Type,Rating,Date Added\n';

    const escapeCsv = (str: string | undefined | null) => {
      if (!str) return '';
      const stringValue = String(str); // Ensure it's a string
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // 1. Lists
    lists?.forEach((list) => {
      Object.values(list.items || {}).forEach((item) => {
        csv += `${escapeCsv('List: ' + list.name)},${escapeCsv(item.title || item.name)},${item.media_type === 'movie' ? 'Movie' : 'TV'},,${new Date(item.addedAt).toLocaleDateString()}\n`;
      });
    });

    // 2. Ratings
    enrichedMovieRatings?.forEach(({ rating, movie }) => {
      csv += `Rating,${escapeCsv(movie?.title)},Movie,${rating.rating},${new Date(rating.ratedAt).toLocaleDateString()}\n`;
    });
    enrichedTVRatings?.forEach(({ rating, tvShow }) => {
      csv += `Rating,${escapeCsv(tvShow?.name)},TV,${rating.rating},${new Date(rating.ratedAt).toLocaleDateString()}\n`;
    });

    // 3. Favorite Content
    favoriteContent?.forEach((item) => {
      csv += `Favorite Content,${escapeCsv(item.title)},${item.mediaType === 'movie' ? 'Movie' : 'TV'},,${new Date(item.addedAt).toLocaleDateString()}\n`;
    });

    // 4. Favorite Persons
    favoritePersons?.forEach((person) => {
      csv += `Favorite Person,${escapeCsv(person.name)},Person,,${new Date(person.addedAt).toLocaleDateString()}\n`;
    });

    return csv;
  }, [lists, enrichedMovieRatings, enrichedTVRatings, favoriteContent, favoritePersons]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setIsExporting(true);
      try {
        const content = format === 'markdown' ? generateMarkdown() : generateCSV();
        const extension = format === 'markdown' ? 'md' : 'csv';
        const filename = `showseek_export.${extension}`;

        // Use type assertion to bypass potential type mismatch
        const fileSystem = FileSystem as any;
        const fileUri = `${fileSystem.documentDirectory}${filename}`;

        await fileSystem.writeAsStringAsync(fileUri, content, {
          encoding: fileSystem.EncodingType.UTF8,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: format === 'markdown' ? 'text/markdown' : 'text/csv',
            dialogTitle: `Export Data as ${format.toUpperCase()}`,
            UTI:
              format === 'markdown'
                ? 'net.daringfireball.markdown'
                : 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      } catch (error) {
        console.error('Export failed:', error);
        Alert.alert('Error', 'Failed to export data');
      } finally {
        setIsExporting(false);
      }
    },
    [generateCSV, generateMarkdown]
  );

  return {
    handleExport,
    isExporting,
  };
};
