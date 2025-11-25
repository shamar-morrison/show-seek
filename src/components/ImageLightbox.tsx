import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { COLORS, SPACING } from '@/src/constants/theme';

const { width, height } = Dimensions.get('window');

interface ImageLightboxProps {
  visible: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
}

export default function ImageLightbox({
  visible,
  onClose,
  images,
  initialIndex = 0,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  if (!visible || images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <X size={32} color={COLORS.white} />
        </TouchableOpacity>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={true}
          contentOffset={{ x: currentIndex * width, y: 0 }}
          onMomentumScrollEnd={(event) => {
            const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentIndex(newIndex);
          }}
        >
          {images.map((imageUrl, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
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
                  currentIndex === index && styles.activeDot,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: SPACING.l,
    zIndex: 10,
    padding: SPACING.s,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    zIndex: 10,
    padding: SPACING.s,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  prevButton: {
    left: SPACING.l,
  },
  nextButton: {
    right: SPACING.l,
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
  activeDot: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
});
