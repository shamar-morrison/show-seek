import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { shareMedia } from '@/src/utils/share';
import { Share2 } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACTIVE_OPACITY = 0.9;

export interface ShareButtonProps {
  id: number;
  title: string;
  mediaType: 'movie' | 'tv';
  onShowToast: (message: string) => void;
}

export function ShareButton({ id, title, mediaType, onShowToast }: ShareButtonProps) {
  const handleShare = () => {
    shareMedia({ id, title, mediaType }, onShowToast);
  };

  return (
    <SafeAreaView style={styles.headerSafe} edges={['top']}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={handleShare}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Share2 size={21} color={COLORS.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: {
    position: 'absolute',
    top: SPACING.s,
    right: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: 14,
    marginRight: 6,
    backgroundColor: COLORS.overlay,
    borderRadius: BORDER_RADIUS.round,
  },
});
