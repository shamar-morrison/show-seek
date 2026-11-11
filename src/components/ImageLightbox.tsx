import { ProfileBackgroundButton } from '@/src/components/profile/ProfileBackgroundButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import type { ProfileBackground } from '@/src/utils/profileBackground';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon, Download01Icon } from '@hugeicons/core-free-icons';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const FALLBACK_IMAGE_EXTENSION = '.jpg';
/** Only images this many pages from the current one are loaded, so long sets stay light. */
const RENDER_WINDOW = 2;

interface ImageLightboxProps {
  visible: boolean;
  onClose: () => void;
  images: string[];
  downloadImages?: string[];
  onShowToast?: (message: string) => void;
  initialIndex?: number;
  /**
   * For posters and backdrops: each image's TMDB path, in the same order as `images`, which adds
   * a "Use as profile background" button. Null entries (or no array) show no button.
   */
  profileBackgrounds?: (ProfileBackground | null)[];
}

export default function ImageLightbox({
  visible,
  onClose,
  images,
  downloadImages,
  onShowToast,
  initialIndex = 0,
  profileBackgrounds,
}: ImageLightboxProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isDownloading, setIsDownloading] = useState(false);
  const lightboxToastRef = useRef<ToastRef>(null);

  // Start from the tapped image each time it opens, even when that's the same index as last time.
  React.useEffect(() => {
    if (visible) setCurrentIndex(initialIndex);
  }, [initialIndex, visible]);

  const getImageExtension = (url: string) => {
    const sanitizedUrl = url.split('?')[0].split('#')[0];
    const extensionMatch = sanitizedUrl.match(/\.([a-zA-Z0-9]+)$/);
    if (!extensionMatch) return FALLBACK_IMAGE_EXTENSION;
    return `.${extensionMatch[1].toLowerCase()}`;
  };

  const showToast = (message: string) => {
    if (lightboxToastRef.current) {
      lightboxToastRef.current.show(message);
      return;
    }
    onShowToast?.(message);
  };

  const handleDownload = async () => {
    if (isDownloading) return;

    const selectedImageUrl = downloadImages?.[currentIndex] || images[currentIndex];
    if (!selectedImageUrl) {
      showToast(t('shareCard.failedToSave'));
      return;
    }

    let tempFileUri: string | null = null;
    setIsDownloading(true);

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        showToast(t('shareCard.permissionDenied'));
        return;
      }

      if (!FileSystem.cacheDirectory) {
        throw new Error('Cache directory is unavailable');
      }

      const extension = getImageExtension(selectedImageUrl);
      tempFileUri = `${FileSystem.cacheDirectory}lightbox-image-${currentIndex}${extension}`;

      const downloadResult = await FileSystem.downloadAsync(selectedImageUrl, tempFileUri);
      await MediaLibrary.saveToLibraryAsync(downloadResult.uri);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(t('shareCard.savedToGallery'));
    } catch (error) {
      console.error('[ImageLightbox] Failed to save image:', error);
      showToast(t('shareCard.failedToSave'));
    } finally {
      setIsDownloading(false);

      if (tempFileUri) {
        try {
          await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('[ImageLightbox] Failed to clean up temp image:', cleanupError);
        }
      }
    }
  };

  if (!visible || images.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.header}>
            {/* The counter sits in the middle; close is on the right. */}
            {images.length > 1 && (
              <View style={styles.counterContainer} pointerEvents="none">
                <Text style={styles.counter} testID="image-lightbox-counter">
                  {currentIndex + 1} / {images.length}
                </Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.headerButton, pressed && { opacity: ACTIVE_OPACITY }]}
              onPress={onClose}
              testID="image-lightbox-close-button"
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <AppIcon icon={Cancel01Icon} size={28} color={COLORS.white} />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={true}
          testID="image-lightbox-scrollview"
          style={styles.pager}
          contentOffset={{ x: currentIndex * width, y: 0 }}
          onMomentumScrollEnd={(event) => {
            const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentIndex(newIndex);
          }}
        >
          {images.map((imageUrl, index) => (
            <View key={index} style={styles.imageContainer}>
              {Math.abs(index - currentIndex) <= RENDER_WINDOW ? (
                <Image source={{ uri: imageUrl }} style={styles.image} contentFit="contain" />
              ) : null}
            </View>
          ))}
        </ScrollView>

        {/* Labelled actions below the image, within thumb reach. */}
        <SafeAreaView edges={['bottom']} style={styles.actionBarSafe}>
          <View style={styles.actionBar} testID="image-lightbox-actions">
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: ACTIVE_OPACITY }]}
              onPress={handleDownload}
              disabled={isDownloading}
              testID="image-lightbox-download-button"
              accessibilityRole="button"
              accessibilityLabel={t('imageViewer.download')}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <AppIcon icon={Download01Icon} size={24} color={COLORS.white} />
              )}
              <Text style={styles.actionLabel} numberOfLines={2}>
                {t('imageViewer.download')}
              </Text>
            </Pressable>
            {profileBackgrounds?.[currentIndex] ? (
              <ProfileBackgroundButton
                image={profileBackgrounds[currentIndex]!}
                onShowToast={showToast}
                style={styles.actionButton}
                labelStyle={styles.actionLabel}
              />
            ) : null}
          </View>
        </SafeAreaView>

        <Toast ref={lightboxToastRef} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  headerSafe: {
    backgroundColor: COLORS.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  counterContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
  },
  pager: {
    flex: 1,
  },
  imageContainer: {
    width,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  actionBarSafe: {
    backgroundColor: COLORS.black,
  },
  actionBar: {
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
  },
  // Styled like the action buttons on movie and TV pages (MediaActionButtons), plus a label under
  // the icon that may wrap to two lines ("Set as profile backdrop" doesn't fit one line beside
  // "Download" on smaller phones). Both buttons stretch to the same height.
  actionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    flex: 1,
    gap: SPACING.xs,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.s,
  },
  actionLabel: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },
});
