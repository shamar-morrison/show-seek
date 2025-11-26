import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, ACTIVE_OPACITY } from '@/src/constants/theme';
import { tmdbApi, getImageUrl, TMDB_IMAGE_SIZES, CastMember, CrewMember } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';

type TabType = 'cast' | 'crew';

interface CastCrewScreenProps {
  id: number;
  type: 'movie' | 'tv';
}

export default function CastCrewScreen({ id, type }: CastCrewScreenProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('cast');

  const creditsQuery = useQuery({
    queryKey: [type, id, 'credits'],
    queryFn: () => (type === 'movie' ? tmdbApi.getMovieCredits(id) : tmdbApi.getTVCredits(id)),
    enabled: !!id,
  });

  const handlePersonPress = (personId: number) => {
    router.push(`/person/${personId}` as any);
  };

  const renderItem = ({ item }: { item: CastMember | CrewMember }) => {
    const isCast = 'character' in item;
    const role = isCast ? (item as CastMember).character : (item as CrewMember).job;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePersonPress(item.id)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
          style={styles.profileImage}
          contentFit="cover"
          placeholderType="person"
        />
        <View style={styles.cardInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {role}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (creditsQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (creditsQuery.isError || !creditsQuery.data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load credits</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = activeTab === 'cast' ? creditsQuery.data.cast : creditsQuery.data.crew;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          activeOpacity={ACTIVE_OPACITY}
        >
          <ArrowLeft size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cast & Crew</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cast' && styles.activeTab]}
          onPress={() => setActiveTab('cast')}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.tabText, activeTab === 'cast' && styles.activeTabText]}>Cast</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'crew' && styles.activeTab]}
          onPress={() => setActiveTab('crew')}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.tabText, activeTab === 'crew' && styles.activeTabText]}>Crew</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        numColumns={3}
        columnWrapperStyle={styles.columnWrapper}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: SPACING.m,
  },
  backButton: {
    padding: SPACING.m,
  },
  backButtonText: {
    color: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerButton: {
    padding: SPACING.s,
  },
  headerTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  tabContainer: {
    flexDirection: 'row',
    padding: SPACING.m,
    gap: SPACING.m,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.s,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.white,
  },
  listContent: {
    padding: SPACING.m,
  },
  columnWrapper: {
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    maxWidth: '31%', // Ensure 3 columns fit with gap
  },
  profileImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  cardInfo: {
    padding: SPACING.s,
  },
  name: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  role: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
});
