import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
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

interface ImageLightboxProps {
  visible: boolean;
  onClose: () => void;
  images: string[];
  downloadImages?: string[];
  onShowToast?: (message: string) => void;
  initialIndex?: number;
}

export default function ImageLightbox({
  visible,
  onClose,
  images,
  downloadImages,
  onShowToast,
  initialIndex = 0,
}: ImageLightboxProps) {
  const { accentColor } = useAccentColor();
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isDownloading, setIsDownloading] = useState(false);
  const lightboxToastRef = useRef<ToastRef>(null);

  React.useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

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
            <Pressable
              style={({ pressed }) => [styles.headerButton, pressed && { opacity: ACTIVE_OPACITY }]}
              onPress={onClose}
              testID="image-lightbox-close-button"
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <AppIcon icon={Cancel01Icon} size={28} color={COLORS.white} />
            </Pressable>

            {images.length > 1 && (
              <Text style={styles.counter} testID="image-lightbox-counter">
                {currentIndex + 1} / {images.length}
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [styles.headerButton, pressed && { opacity: ACTIVE_OPACITY }]}
              onPress={handleDownload}
              disabled={isDownloading}
              testID="image-lightbox-download-button"
              accessibilityRole="button"
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <AppIcon icon={Download01Icon} size={24} color={COLORS.white} />
              )}
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
              <Image source={{ uri: imageUrl }} style={styles.image} contentFit="contain" />
            </View>
          ))}
        </ScrollView>

        {images.length > 1 && (
          <View style={styles.indicator}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  currentIndex === index && { backgroundColor: accentColor, width: 24 },
                ]}
              />
            ))}
          </View>
        )}

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
    justifyContent: 'space-between',
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
  counter: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
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
  indicator: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
});
