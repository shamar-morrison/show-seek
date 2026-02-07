import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { useDetailStyles } from '@/src/components/detail/detailStyles';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { OpenWithButton } from '@/src/components/ui/OpenWithButton';
import { ShareButton } from '@/src/components/ui/ShareButton';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import React, { memo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface TVHeroSectionProps {
  /** Path to the backdrop image */
  backdropPath: string | null;
  /** Path to the poster image */
  posterPath: string | null;
  /** Show name for share button */
  showName: string;
  /** Show ID for share button */
  showId: number;
  /** Handler for back button press */
  onBackPress: () => void;
  /** Handler for open-with button press */
  onOpenWithPress: () => void;
  /** Handler for toast messages */
  onShowToast: (message: string) => void;
}

/**
 * Hero section for TV detail screen containing:
 * - Backdrop image with gradient overlay
 * - Back button in safe area
 * - Share button
 * - Poster overlay
 */
export const TVHeroSection = memo<TVHeroSectionProps>(
  ({ backdropPath, posterPath, showName, showId, onBackPress, onOpenWithPress, onShowToast }) => {
    const styles = useDetailStyles();
    const backdropUrl = getImageUrl(backdropPath, TMDB_IMAGE_SIZES.backdrop.medium);
    const posterUrl = getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.medium);

    return (
      <View style={styles.heroContainer}>
        <MediaImage
          source={{ uri: backdropUrl }}
          style={styles.backdrop}
          contentFit="cover"
        />
        <LinearGradient colors={['transparent', COLORS.background]} style={styles.gradient} />

        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onBackPress}
            activeOpacity={ACTIVE_OPACITY}
          >
            <ArrowLeft size={22} color={COLORS.white} />
          </TouchableOpacity>
        </SafeAreaView>

        <ShareButton id={showId} title={showName} mediaType="tv" onShowToast={onShowToast} />
        <OpenWithButton onPress={onOpenWithPress} />

        <View style={styles.posterContainer}>
          <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
        </View>
      </View>
    );
  }
);

TVHeroSection.displayName = 'TVHeroSection';
