import { tmdbApi, WatchProvider } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useRegion } from '@/src/context/RegionProvider';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface ProviderSelectorProps {
  selectedProviders: number[];
  onSelectionChange: (providers: number[]) => void;
  maxProviders?: number;
}

export function ProviderSelector({
  selectedProviders,
  onSelectionChange,
  maxProviders = 5,
}: ProviderSelectorProps) {
  const { region } = useRegion();

  const {
    data: providers,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['watchProviders', 'movie', region],
    queryFn: () => tmdbApi.getWatchProviders('movie'),
    staleTime: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  const toggleProvider = (providerId: number) => {
    if (selectedProviders.includes(providerId)) {
      onSelectionChange(selectedProviders.filter((id) => id !== providerId));
    } else {
      onSelectionChange([...selectedProviders, providerId]);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !providers) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load streaming services</Text>
      </View>
    );
  }

  // Get top providers (already sorted by display_priority from API)
  const topProviders = providers.slice(0, maxProviders);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.providersGrid}>
        {topProviders.map((provider: WatchProvider) => {
          const isSelected = selectedProviders.includes(provider.provider_id);
          const logoUrl = provider.logo_path
            ? `https://image.tmdb.org/t/p/w92${provider.logo_path}`
            : null;

          return (
            <TouchableOpacity
              key={provider.provider_id}
              style={[styles.providerCard, isSelected && styles.providerCardSelected]}
              onPress={() => toggleProvider(provider.provider_id)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <View style={styles.logoContainer}>
                {logoUrl && (
                  <Image
                    source={{ uri: logoUrl }}
                    style={styles.providerLogo}
                    contentFit="contain"
                  />
                )}
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Check size={14} color={COLORS.white} />
                  </View>
                )}
              </View>
              <Text style={styles.providerName} numberOfLines={2}>
                {provider.provider_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  providersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
    justifyContent: 'center',
  },
  providerCard: {
    width: 100,
    alignItems: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceLight,
  },
  logoContainer: {
    position: 'relative',
    marginBottom: SPACING.s,
  },
  providerLogo: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.m,
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text,
    textAlign: 'center',
    fontWeight: '500',
  },
});
