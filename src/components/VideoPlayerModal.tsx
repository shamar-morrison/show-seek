import { ModalBackground } from '@/src/components/ui/ModalBackground';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { extractYouTubeVideoId } from '@/src/utils/youtube';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { AlertCircleIcon, SquareArrowUpRightIcon } from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useYouTubeEvent, useYouTubePlayer, YoutubeView } from 'react-native-youtube-bridge';

export interface TrailerPlayerProps {
  visible: boolean;
  onClose: () => void;
  videoKey: string | null;
  title?: string;
}

interface YouTubeEmbedPlayerProps {
  videoId: string;
}

function YouTubeEmbedPlayer({ videoId }: YouTubeEmbedPlayerProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const player = useYouTubePlayer(videoId, {
    autoplay: true,
    controls: true,
    playsinline: true,
    rel: false,
  });

  // Explicitly pause/stop on component unmount
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.stop();
      } catch {
        // Ignore unmount errors
      }
    };
  }, [player]);

  useYouTubeEvent(player, 'ready', () => {
    setIsLoading(false);
  });

  useYouTubeEvent(player, 'stateChange', (state) => {
    // 1: PLAYING, 2: PAUSED, 3: BUFFERING
    if (state === 1 || state === 2) {
      setIsLoading(false);
    }
  });

  useYouTubeEvent(player, 'error', (error) => {
    console.warn('YouTube playback error:', error);
    setHasError(true);
    setIsLoading(false);
  });

  const handleOpenExternal = useCallback(() => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open YouTube URL:', err);
    });
  }, [videoId]);

  if (hasError) {
    return (
      <View style={styles.stateContainer}>
        <AppIcon
          icon={AlertCircleIcon}
          size={32}
          color={COLORS.error || '#E50914'}
          style={styles.stateIcon}
        />
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorSubtitle}>{t('errors.unableToOpenVideo')}</Text>
        <Pressable
          style={({ pressed }) => [styles.fallbackButton, pressed && { opacity: ACTIVE_OPACITY }]}
          onPress={handleOpenExternal}
          accessibilityRole="button"
          accessibilityLabel="Open in YouTube"
        >
          <AppIcon
            icon={SquareArrowUpRightIcon}
            size={16}
            color={COLORS.text}
            style={styles.buttonIcon}
          />
          <Text style={styles.fallbackButtonText}>
            {t('media.openInYouTube', 'Open in YouTube')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.videoWrapper}>
      <YoutubeView player={player} width="100%" height="100%" />
      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
    </View>
  );
}

export default function TrailerPlayer({ visible, onClose, videoKey, title }: TrailerPlayerProps) {
  const { t } = useTranslation();
  const videoId = extractYouTubeVideoId(videoKey);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlayContainer}>
        {/* Soft background blur / lightened dark overlay */}
        <ModalBackground intensity={30} />

        {/* Tap area above the player group to dismiss */}
        <Pressable
          testID="trailer-player-backdrop"
          style={styles.backdropFiller}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />

        {/* Center content block: header sitting directly above the edge-to-edge player */}
        <View style={styles.playerGroup}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title || t('media.watchTrailer')}
            </Text>
          </View>

          <View style={styles.edgeToEdgePlayerContainer}>
            {visible && videoId ? (
              <YouTubeEmbedPlayer videoId={videoId} />
            ) : (
              <View style={styles.stateContainer}>
                <AppIcon
                  icon={AlertCircleIcon}
                  size={32}
                  color={COLORS.textSecondary}
                  style={styles.stateIcon}
                />
                <Text style={styles.errorSubtitle}>
                  {t('media.noTrailerAvailable', 'No trailer available')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Tap area below the player group to dismiss */}
        <Pressable
          testID="trailer-player-backdrop-bottom"
          style={styles.backdropFiller}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
  },
  backdropFiller: {
    flex: 1,
    width: '100%',
  },
  playerGroup: {
    width: '100%',
  },
  header: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.s,
  },
  headerTitle: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  edgeToEdgePlayerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  stateContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.m,
  },
  stateIcon: {
    marginBottom: SPACING.s,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    marginBottom: SPACING.xs,
  },
  errorSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
    marginTop: SPACING.m,
  },
  buttonIcon: {
    marginRight: SPACING.xs,
  },
  fallbackButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
});
