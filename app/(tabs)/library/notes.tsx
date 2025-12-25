import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import NoteSheet, { NoteSheetRef } from '@/src/components/NoteSheet';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useNotes } from '@/src/hooks/useNotes';
import { Note } from '@/src/types/note';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pencil, StickyNote, Trash2 } from 'lucide-react-native';
import React, { useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
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
  const { isPremium } = usePremium();
  const { getAllNotes, isLoadingNotes, refetchNotes, deleteNote, isDeleting } = useNotes();
  const noteSheetRef = useRef<NoteSheetRef>(null);

  const handleNotePress = useCallback((note: Note) => {
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
              await deleteNote({ mediaType: note.mediaType, mediaId: note.mediaId });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]);
    },
    [deleteNote]
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
  if (isLoadingNotes) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Empty state
  if (!getAllNotes || getAllNotes.length === 0) {
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
      <TouchableOpacity
        style={styles.noteCard}
        onPress={() => handleNotePress(item)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
        <View style={styles.noteContent}>
          <View style={styles.noteHeader}>
            <Text style={styles.mediaTitle} numberOfLines={1}>
              {item.mediaTitle}
            </Text>
            <View style={styles.mediaTypeBadge}>
              <Text style={styles.mediaTypeText}>
                {item.mediaType === 'movie' ? 'Movie' : 'TV'}
              </Text>
            </View>
          </View>
          <Text style={styles.noteText} numberOfLines={2}>
            {truncateText(item.content, 60)}
          </Text>
          <View style={styles.noteFooter}>
            <Text style={styles.timestamp}>{formatRelativeTime(item.updatedAt)}</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => handleNotePress(item)}
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Pencil size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteNote(item)}
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={isDeleting}
              >
                <Trash2 size={16} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <FlashList
        data={getAllNotes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <NoteSheet ref={noteSheetRef} onSave={() => refetchNotes()} onDelete={() => refetchNotes()} />
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
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
  },
  poster: {
    width: 70,
    height: 105,
  },
  noteContent: {
    flex: 1,
    padding: SPACING.m,
    justifyContent: 'space-between',
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  mediaTitle: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  mediaTypeBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.s,
  },
  mediaTypeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  noteText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginVertical: SPACING.xs,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timestamp: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
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
