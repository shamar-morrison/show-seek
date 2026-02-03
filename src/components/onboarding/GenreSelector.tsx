import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAllGenres } from '@/src/hooks/useGenres';
import { Check } from 'lucide-react-native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface GenreSelectorProps {
  selectedGenres: number[];
  onSelectionChange: (genres: number[]) => void;
}

export function GenreSelector({ selectedGenres, onSelectionChange }: GenreSelectorProps) {
  const { data: genreMap, isLoading, error } = useAllGenres();

  const toggleGenre = (genreId: number) => {
    if (selectedGenres.includes(genreId)) {
      onSelectionChange(selectedGenres.filter((id) => id !== genreId));
    } else {
      onSelectionChange([...selectedGenres, genreId]);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !genreMap) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load genres</Text>
      </View>
    );
  }

  // Convert genre map to array and sort alphabetically
  const genres = Object.entries(genreMap)
    .map(([id, name]) => ({ id: parseInt(id), name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.chipsContainer}>
        {genres.map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          return (
            <TouchableOpacity
              key={genre.id}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => toggleGenre(genre.id)}
              activeOpacity={ACTIVE_OPACITY}
            >
              {isSelected && <Check size={16} color={COLORS.white} style={styles.checkIcon} />}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {genre.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkIcon: {
    marginRight: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
});
