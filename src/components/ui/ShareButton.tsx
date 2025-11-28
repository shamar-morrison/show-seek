import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Share2 } from 'lucide-react-native';
import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { shareMedia } from '@/src/utils/share';

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
        <Share2 size={24} color={COLORS.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: {
    position: 'absolute',
    top: 10,
    right: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: SPACING.m,
    marginRight: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.round,
  },
});
