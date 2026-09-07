import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { extractYouTubeVideoId } from '@/src/utils/youtube';
import { AlertCircle, ExternalLink, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
        <AlertCircle size={32} color={COLORS.error || '#E50914'} style={styles.stateIcon} />
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorSubtitle}>{t('errors.unableToOpenVideo')}</Text>
        <Pressable
          style={({ pressed }) => [styles.fallbackButton, pressed && { opacity: ACTIVE_OPACITY }]}
          onPress={handleOpenExternal}
          accessibilityRole="button"
          accessibilityLabel="Open in YouTube"
        >
          <ExternalLink size={16} color={COLORS.text} style={styles.buttonIcon} />
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
      <View style={styles.backdrop}>
        <ModalBackground />
        <Pressable
          testID="trailer-player-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={styles.dialogCard}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title || t('media.watchTrailer')}
            </Text>
            <Pressable
              testID="trailer-player-close-button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: ACTIVE_OPACITY }]}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={18} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.playerContainer}>
            {visible && videoId ? (
              <YouTubeEmbedPlayer videoId={videoId} />
            ) : (
              <View style={styles.stateContainer}>
                <AlertCircle size={32} color={COLORS.textSecondary} style={styles.stateIcon} />
                <Text style={styles.errorSubtitle}>
                  {t('media.noTrailerAvailable', 'No trailer available')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.m,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.44,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.text,
    marginRight: SPACING.s,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: BORDER_RADIUS.m,
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
});
