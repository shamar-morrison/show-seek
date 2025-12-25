import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import NoteModal, { NoteSheetRef } from '@/src/components/NoteModal';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useDeleteNote, useNotes } from '@/src/hooks/useNotes';
import { Note } from '@/src/types/note';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pencil, StickyNote, Trash2 } from 'lucide-react-native';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Format relative time (e.g., "2 days ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) {
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }

  const months = Math.floor(diffDays / 30);
  if (diffDays < 365) {
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(diffDays / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export default function NotesScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { isPremium } = usePremium();
  const { data: notes, isLoading } = useNotes();
  const deleteNoteMutation = useDeleteNote();
  const noteSheetRef = useRef<NoteSheetRef>(null);

  const handleCardPress = useCallback(
    (note: Note) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!currentTab) {
        console.warn('Cannot navigate: currentTab is null');
        return;
      }

      const mediaPath = note.mediaType === 'movie' ? 'movie' : 'tv';
      const path = `/(tabs)/${currentTab}/${mediaPath}/${note.mediaId}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const handleEditNote = useCallback((note: Note) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    noteSheetRef.current?.present({
      mediaType: note.mediaType,
      mediaId: note.mediaId,
      posterPath: note.posterPath,
      mediaTitle: note.mediaTitle,
      initialNote: note.content,
    });
  }, []);

  const handleDeleteNote = useCallback(
    async (note: Note) => {
      Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNoteMutation.mutateAsync({
                mediaType: note.mediaType,
                mediaId: note.mediaId,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]);
    },
    [deleteNoteMutation]
  );

  // Premium gate
  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <View style={styles.premiumGate}>
          <StickyNote size={60} color={COLORS.textSecondary} />
          <Text style={styles.premiumTitle}>Premium Feature</Text>
          <Text style={styles.premiumDescription}>
            Notes are a premium feature. Upgrade to unlock and add personal notes to your movies and
            TV shows.
          </Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/premium' as any)}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Empty state
  if (!notes || notes.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={StickyNote}
          title="No Notes Yet"
          description="Add notes to movies and TV shows from their detail pages."
        />
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: Note }) => {
    const posterUrl = getImageUrl(item.posterPath, TMDB_IMAGE_SIZES.poster.small);

    return (
      <Pressable
        style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}
        onPress={() => handleCardPress(item)}
      >
        <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
        <View style={styles.noteContent}>
          <Text style={styles.mediaTitle} numberOfLines={1}>
            {item.mediaTitle}
          </Text>
          <Text style={styles.noteText} numberOfLines={2}>
            {truncateText(item.content, 80)}
          </Text>
          <Text style={styles.timestamp}>{formatRelativeTime(item.updatedAt)}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => handleEditNote(item)}
            style={styles.actionButton}
            hitSlop={HIT_SLOP.m}
          >
            <Pencil size={20} color={COLORS.text} />
          </Pressable>
          <Pressable
            onPress={() => handleDeleteNote(item)}
            style={styles.actionButton}
            hitSlop={HIT_SLOP.m}
            disabled={deleteNoteMutation.isPending}
          >
            {deleteNoteMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <Trash2 size={20} color={COLORS.error} />
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <FlashList
        data={notes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <NoteModal ref={noteSheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  separator: {
    height: SPACING.m,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  noteCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  noteContent: {
    flex: 1,
    gap: SPACING.xs,
  },
  mediaTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  noteText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'column',
    gap: SPACING.m,
  },
  actionButton: {
    padding: SPACING.xs,
  },
  // Premium gate styles
  premiumGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  premiumTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.l,
    marginBottom: SPACING.s,
  },
  premiumDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  upgradeButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
});
