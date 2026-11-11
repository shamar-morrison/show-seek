import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { useDetailStyles } from '@/src/components/detail/detailStyles';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { OpenWithButton } from '@/src/components/ui/OpenWithButton';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import React, { memo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface TVHeroSectionProps {
  /** Path to the backdrop image */
  backdropPath: string | null;
  /** Path to the poster image */
  posterPath: string | null;
  /** Show name for share button */
  /** Show ID for share button */
  /** Handler for back button press */
  onBackPress: () => void;
  /** Handler for open-with button press */
  onOpenWithPress: () => void;
  /** Handler for poster press */
  onPosterPress: () => void;
  /** Handler for toast messages */
}

/**
 * Hero section for TV detail screen containing:
 * - Backdrop image with gradient overlay
 * - Back button in safe area
 * - Share button
 * - Poster overlay
 */
export const TVHeroSection = memo<TVHeroSectionProps>(
  ({ backdropPath, posterPath, onBackPress, onOpenWithPress, onPosterPress }) => {
    const styles = useDetailStyles();
    const backdropUrl = getImageUrl(backdropPath, TMDB_IMAGE_SIZES.backdrop.medium);
    const posterUrl = getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.medium);

    return (
      <View style={styles.heroContainer}>
        <MediaImage source={{ uri: backdropUrl }} style={styles.backdrop} contentFit="cover" />
        <LinearGradient colors={['transparent', COLORS.background]} style={styles.gradient} />

        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onBackPress}
            activeOpacity={ACTIVE_OPACITY}
          >
            <AppIcon icon={ArrowLeft01Icon} size={22} color={COLORS.white} />
          </TouchableOpacity>
        </SafeAreaView>

        <OpenWithButton onPress={onOpenWithPress} />

        <TouchableOpacity
          style={styles.posterContainer}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onPosterPress}
        >
          <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
        </TouchableOpacity>
      </View>
    );
  }
);

TVHeroSection.displayName = 'TVHeroSection';
