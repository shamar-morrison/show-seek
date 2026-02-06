import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { Download, X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');
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
      const { status } = await MediaLibrary.requestPermissionsAsync();
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
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          activeOpacity={ACTIVE_OPACITY}
          testID="image-lightbox-close-button"
        >
          <X size={32} color={COLORS.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadButton}
          onPress={handleDownload}
          activeOpacity={ACTIVE_OPACITY}
          disabled={isDownloading}
          testID="image-lightbox-download-button"
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Download size={26} color={COLORS.white} />
          )}
        </TouchableOpacity>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={true}
          testID="image-lightbox-scrollview"
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: '25%',
    alignSelf: 'center',
    zIndex: 10,
    padding: SPACING.s,
    backgroundColor: COLORS.black,
    borderRadius: 20,
  },
  downloadButton: {
    position: 'absolute',
    top: '25%',
    right: SPACING.xl,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black,
    borderRadius: 20,
  },
  imageContainer: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height * 0.8,
  },
  indicator: {
    position: 'absolute',
    bottom: 50,
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
