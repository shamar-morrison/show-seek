import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { X } from 'lucide-react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '@/src/constants/theme';

interface VideoPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  videoKey: string | null;
  videoTitle?: string;
}

export default function VideoPlayerModal({
  visible,
  onClose,
  videoKey,
  videoTitle,
}: VideoPlayerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const youtubeUrl = videoKey ? `https://www.youtube.com/watch?v=${videoKey}` : null;
  
  // YouTube embed URL for in-app playback
  const embedUrl = videoKey 
    ? `https://www.youtube.com/embed/${videoKey}?autoplay=1&playsinline=1`
    : null;

  const player = useVideoPlayer(embedUrl || '', player => {
    player.play();
  });

  const handleError = async () => {
    setHasError(true);
    // Fallback to opening in YouTube app or browser
    if (youtubeUrl) {
      Alert.alert(
        'Video Playback Error',
        'Unable to play video in-app. Would you like to open it in YouTube?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: onClose,
          },
          {
            text: 'Open YouTube',
            onPress: async () => {
              try {
                const supported = await Linking.canOpenURL(youtubeUrl);
                if (supported) {
                  await Linking.openURL(youtubeUrl);
                }
                onClose();
              } catch (error) {
                Alert.alert('Error', 'Failed to open YouTube');
                onClose();
              }
            },
          },
        ]
      );
    }
  };

  const handleClose = () => {
    setIsLoading(true);
    setHasError(false);
    player.pause();
    onClose();
  };

  if (!videoKey) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {videoTitle || 'Trailer'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.videoContainer}>
            {!hasError && embedUrl && (
              <>
                <VideoView
                  style={styles.video}
                  player={player}
                  allowsFullscreen
                  allowsPictureInPicture
                  nativeControls
                />
                {isLoading && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                  </View>
                )}
              </>
            )}
            
            {hasError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Failed to load video</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 600,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
  },
  title: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: SPACING.m,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  videoContainer: {
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.background,
    position: 'relative',
  },
  video: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
  },
});
