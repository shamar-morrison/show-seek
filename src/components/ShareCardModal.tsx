import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Download, Share2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import {
  MediaShareCardData,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  ShareCard,
  StatsShareCardData,
} from './shareCard/ShareCard';

type ModalState = 'generating' | 'preview' | 'sharing' | 'saving';

interface ShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  mediaData?: MediaShareCardData;
  statsData?: StatsShareCardData;
  onShowToast?: (message: string) => void;
}

export default function ShareCardModal({
  visible,
  onClose,
  mediaData,
  statsData,
  onShowToast,
}: ShareCardModalProps) {
  const [state, setState] = useState<ModalState>('generating');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  // Generate image when modal becomes visible
  useEffect(() => {
    if (visible) {
      setState('generating');
      setImageUri(null);

      // Delay to ensure the card and background images are fully rendered
      const timer = setTimeout(() => {
        captureCard();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [visible, mediaData, statsData]);

  const captureCard = async () => {
    if (!cardRef.current) {
      console.error('[ShareCardModal] Card ref is null');
      setState('preview');
      return;
    }

    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
      });

      setImageUri(uri);
      setState('preview');
    } catch (error) {
      console.error('[ShareCardModal] Failed to capture card:', error);
      onShowToast?.('Failed to generate share card');
      onClose();
    }
  };

  const handleShare = useCallback(async () => {
    if (!imageUri) return;

    setState('sharing');

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        onShowToast?.('Sharing is not available on this device');
        setState('preview');
        return;
      }

      await Sharing.shareAsync(imageUri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your ShowSeek card',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error('[ShareCardModal] Failed to share:', error);
      onShowToast?.('Failed to share');
      setState('preview');
    }
  }, [imageUri, onClose, onShowToast]);

  const handleSave = useCallback(async () => {
    if (!imageUri) return;

    setState('saving');

    try {
      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();

      if (status !== 'granted') {
        onShowToast?.('Permission to access gallery was denied');
        setState('preview');
        return;
      }

      // Save to gallery
      await MediaLibrary.saveToLibraryAsync(imageUri);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onShowToast?.('Saved to gallery!');
      onClose();
    } catch (error) {
      console.error('[ShareCardModal] Failed to save:', error);
      onShowToast?.('Failed to save to gallery');
      setState('preview');
    }
  }, [imageUri, onClose, onShowToast]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const isLoading = state === 'generating';
  const isProcessing = state === 'sharing' || state === 'saving';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <ModalBackground />
      <Pressable style={styles.backdrop} onPress={handleClose} />

      <View style={styles.container}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Share Card</Text>
            <Pressable onPress={handleClose} disabled={isProcessing}>
              {({ pressed }) => (
                <View style={{ opacity: pressed ? ACTIVE_OPACITY : 1 }}>
                  <X size={24} color={COLORS.text} />
                </View>
              )}
            </Pressable>
          </View>

          {/* Preview Area */}
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewContainer}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Generating...</Text>
              </View>
            ) : (
              <View style={styles.previewWrapper}>
                <Text style={styles.previewLabel}>Preview</Text>
                {/* Display the captured image */}
                <View style={styles.previewImageContainer}>
                  {imageUri && (
                    <ExpoImage
                      source={{ uri: imageUri }}
                      style={styles.previewImage}
                      contentFit="contain"
                    />
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.shareButton,
                (isLoading || isProcessing) && styles.disabledButton,
                pressed && { opacity: ACTIVE_OPACITY },
              ]}
              onPress={handleShare}
              disabled={isLoading || isProcessing}
            >
              {state === 'sharing' ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Share2 size={20} color={COLORS.white} />
                  <Text style={styles.actionButtonText}>Share to...</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.saveButton,
                (isLoading || isProcessing) && styles.disabledButton,
                pressed && { opacity: ACTIVE_OPACITY },
              ]}
              onPress={handleSave}
              disabled={isLoading || isProcessing}
            >
              {state === 'saving' ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Download size={20} color={COLORS.primary} />
                  <Text style={styles.saveButtonText}>Save to Gallery</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Hidden ShareCard for capture - positioned off-screen */}
      <View style={styles.hiddenContainer} pointerEvents="none">
        <ShareCard ref={cardRef} mediaData={mediaData} statsData={statsData} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.l,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  previewScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  previewContainer: {
    padding: SPACING.l,
    alignItems: 'center',
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.m,
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
  },
  previewWrapper: {
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
  },
  previewImageContainer: {
    width: 200, // Scaled down from 1080
    height: 356, // Scaled down from 1920 (maintains 9:16)
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  actions: {
    padding: SPACING.l,
    gap: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  shareButton: {
    backgroundColor: COLORS.primary,
  },
  saveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  // Hidden container for the actual share card
  hiddenContainer: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
});
