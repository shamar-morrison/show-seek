import { getImageUrl, tmdbApi, WatchProvider } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, HIT_SLOP, SPACING, hexToRGBA } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useRegion } from '@/src/context/RegionProvider';
import { useLists } from '@/src/hooks/useLists';
import { useWatchProviderEnrichment } from '@/src/hooks/useWatchProviderEnrichment';
import { UserList } from '@/src/services/ListService';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Check, ChevronDown, Crown, List, Tv2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PROVIDER_LIST_GC_TIME = 1000 * 60 * 60 * 24 * 30; // 30 days

const DEFAULT_LIST_LABEL_KEYS: Record<string, string> = {
  watchlist: 'lists.shouldWatch',
  'currently-watching': 'lists.watching',
  'already-watched': 'lists.alreadyWatched',
  favorites: 'lists.favorites',
  dropped: 'lists.dropped',
};

const triggerLightHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

function getDisplayListName(list: UserList, t: (key: string, options?: Record<string, unknown>) => string) {
  const labelKey = DEFAULT_LIST_LABEL_KEYS[list.id];
  return labelKey ? t(labelKey) : list.name;
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Tv2 size={56} color={COLORS.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

export default function WhereToWatchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accentColor } = useAccentColor();
  const { region } = useRegion();
  const { isPremium } = usePremium();
  const queryClient = useQueryClient();

  const {
    data: lists = [],
    isLoading: isLoadingLists,
    isError: isListsError,
    error: listsError,
    refetch: refetchLists,
  } = useLists();

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<WatchProvider | null>(null);
  const [isListModalVisible, setIsListModalVisible] = useState(false);
  const [isServiceModalVisible, setIsServiceModalVisible] = useState(false);
  const [pendingServiceValidation, setPendingServiceValidation] = useState(false);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const selectedListItems = useMemo(
    () => (selectedList ? Object.values(selectedList.items || {}) : []),
    [selectedList]
  );

  const {
    providerMap,
    isLoadingEnrichment,
  } = useWatchProviderEnrichment(selectedListItems, !!selectedList);

  const movieProvidersQuery = useQuery({
    queryKey: ['watch-providers-catalog', region, 'movie'],
    queryFn: () => tmdbApi.getWatchProviders('movie'),
    staleTime: Infinity,
    gcTime: PROVIDER_LIST_GC_TIME,
    enabled: !!selectedList,
    initialData: () => queryClient.getQueryData<WatchProvider[]>(['watchProviders', 'movie']),
  });

  const tvProvidersQuery = useQuery({
    queryKey: ['watch-providers-catalog', region, 'tv'],
    queryFn: () => tmdbApi.getWatchProviders('tv'),
    staleTime: Infinity,
    gcTime: PROVIDER_LIST_GC_TIME,
    enabled: !!selectedList,
    initialData: () => queryClient.getQueryData<WatchProvider[]>(['watchProviders', 'tv']),
  });

  const mergedProviders = useMemo(() => {
    const providerMapById = new Map<number, WatchProvider>();
    const allProviders = [...(movieProvidersQuery.data || []), ...(tvProvidersQuery.data || [])];

    allProviders.forEach((provider) => {
      const existing = providerMapById.get(provider.provider_id);
      if (!existing || provider.display_priority < existing.display_priority) {
        providerMapById.set(provider.provider_id, provider);
      }
    });

    return Array.from(providerMapById.values()).sort(
      (a, b) => a.display_priority - b.display_priority
    );
  }, [movieProvidersQuery.data, tvProvidersQuery.data]);

  const providerCounts = useMemo(() => {
    const counts = new Map<number, number>();

    selectedListItems.forEach((item) => {
      const providers = providerMap.get(item.id)?.flatrate || [];
      const seenForItem = new Set<number>();

      providers.forEach((provider) => {
        if (seenForItem.has(provider.provider_id)) {
          return;
        }

        seenForItem.add(provider.provider_id);
        counts.set(provider.provider_id, (counts.get(provider.provider_id) || 0) + 1);
      });
    });

    return counts;
  }, [providerMap, selectedListItems]);

  const visibleProviders = useMemo(() => {
    if (isLoadingEnrichment) {
      return mergedProviders;
    }

    return mergedProviders.filter((provider) => (providerCounts.get(provider.provider_id) || 0) > 0);
  }, [isLoadingEnrichment, mergedProviders, providerCounts]);

  const filteredItems = useMemo(() => {
    if (!selectedService) {
      return [];
    }

    return selectedListItems.filter((item) => {
      const providers = providerMap.get(item.id);
      return providers?.flatrate?.some((provider) => provider.provider_id === selectedService.provider_id) ?? false;
    });
  }, [providerMap, selectedListItems, selectedService]);

  useEffect(() => {
    if (!selectedListId) {
      return;
    }

    const listStillExists = lists.some((list) => list.id === selectedListId);
    if (!listStillExists) {
      setSelectedListId(null);
      setSelectedService(null);
      setPendingServiceValidation(false);
    }
  }, [lists, selectedListId]);

  useEffect(() => {
    if (!pendingServiceValidation || isLoadingEnrichment) {
      return;
    }

    if (selectedService && (providerCounts.get(selectedService.provider_id) || 0) === 0) {
      setSelectedService(null);
    }

    setPendingServiceValidation(false);
  }, [isLoadingEnrichment, pendingServiceValidation, providerCounts, selectedService]);

  const handleOpenListModal = () => {
    triggerLightHaptic();
    setIsListModalVisible(true);
  };

  const handleOpenServiceModal = () => {
    if (!selectedList) {
      return;
    }

    triggerLightHaptic();
    setIsServiceModalVisible(true);
  };

  const handleListSelect = useCallback(
    (list: UserList) => {
      triggerLightHaptic();
      if (selectedService && selectedListId !== list.id) {
        setPendingServiceValidation(true);
      }
      setSelectedListId(list.id);
      setIsListModalVisible(false);
    },
    [selectedListId, selectedService]
  );

  const handleServiceSelect = useCallback((provider: WatchProvider) => {
    triggerLightHaptic();
    setSelectedService(provider);
    setIsServiceModalVisible(false);
  }, []);

  const handleResultPress = useCallback(
    (item: (typeof selectedListItems)[number]) => {
      triggerLightHaptic();
      if (item.media_type === 'movie') {
        router.push({
          pathname: '/(tabs)/home/movie/[id]',
          params: { id: item.id },
        });
      } else {
        router.push({
          pathname: '/(tabs)/home/tv/[id]',
          params: { id: item.id },
        });
      }
    },
    [router]
  );

  const handleUpgradePress = () => {
    triggerLightHaptic();
    router.push('/premium');
  };

  const selectedListName = selectedList ? getDisplayListName(selectedList, t) : null;
  const selectedServiceLogo = getImageUrl(selectedService?.logo_path || null, '/w92');
  const showPremiumOverlay = !isPremium && !!selectedList;

  const renderResultItem = useCallback(
    ({ item }: { item: (typeof selectedListItems)[number] }) => (
      <Pressable
        style={({ pressed }) => [styles.resultCard, pressed && styles.resultCardPressed]}
        onPress={() => handleResultPress(item)}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.poster_path, '/w185') }}
          style={styles.resultPoster}
          contentFit="cover"
          placeholderType={item.media_type === 'movie' ? 'movie' : 'tv'}
        />
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {item.title || item.name}
          </Text>
          <View style={styles.resultMetaRow}>
            <View style={[styles.mediaTypeBadge, { borderColor: accentColor }]}>
              <Text style={[styles.mediaTypeText, { color: accentColor }]}>
                {item.media_type === 'movie' ? t('media.movie') : t('media.tvShow')}
              </Text>
            </View>
            {selectedServiceLogo && (
              <MediaImage
                source={{ uri: selectedServiceLogo }}
                style={styles.resultProviderLogo}
                contentFit="contain"
              />
            )}
          </View>
        </View>
      </Pressable>
    ),
    [accentColor, handleResultPress, selectedServiceLogo, t]
  );

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <Text style={styles.introText}>{t('whereToWatch.intro')}</Text>

        <View style={styles.selectorRow}>
          <Pressable
            testID="where-to-watch-list-selector"
            style={({ pressed }) => [
              styles.selectorButton,
              { borderColor: accentColor },
              pressed && styles.selectorPressed,
            ]}
            onPress={handleOpenListModal}
          >
            <List size={18} color={accentColor} />
            <Text style={styles.selectorText} numberOfLines={1}>
              {selectedListName || t('whereToWatch.selectList')}
            </Text>
            <ChevronDown size={18} color={accentColor} />
          </Pressable>

          <Pressable
            testID="where-to-watch-service-selector"
            style={({ pressed }) => [
              styles.selectorButton,
              { borderColor: selectedList ? accentColor : COLORS.surfaceLight },
              !selectedList && styles.selectorDisabled,
              selectedList && pressed && styles.selectorPressed,
            ]}
            onPress={handleOpenServiceModal}
            disabled={!selectedList}
          >
            {selectedServiceLogo ? (
              <MediaImage source={{ uri: selectedServiceLogo }} style={styles.selectorLogo} contentFit="contain" />
            ) : (
              <Tv2 size={18} color={selectedList ? accentColor : COLORS.textSecondary} />
            )}
            <Text
              style={[styles.selectorText, !selectedList && styles.selectorTextDisabled]}
              numberOfLines={1}
            >
              {selectedService?.provider_name || t('whereToWatch.selectService')}
            </Text>
            <ChevronDown size={18} color={selectedList ? accentColor : COLORS.textSecondary} />
          </Pressable>
        </View>

        {selectedList && isLoadingEnrichment && (
          <View style={styles.enrichmentIndicator} testID="where-to-watch-enrichment-indicator">
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={styles.enrichmentText}>{t('whereToWatch.updatingAvailability')}</Text>
          </View>
        )}

        <View style={styles.resultsContainer}>
          {!selectedList ? (
            <EmptyState
              title={t('whereToWatch.emptyNoListTitle')}
              description={t('whereToWatch.emptyNoListDescription')}
            />
          ) : !selectedService ? (
            <EmptyState
              title={t('whereToWatch.emptyNoServiceTitle')}
              description={t('whereToWatch.emptyNoServiceDescription')}
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title={t('whereToWatch.emptyNoMatchesTitle')}
              description={t('whereToWatch.emptyNoMatchesDescription', {
                listName: selectedListName,
                serviceName: selectedService.provider_name,
                region,
              })}
            />
          ) : (
            <FlashList
              data={filteredItems}
              renderItem={renderResultItem}
              keyExtractor={(item) => `${item.media_type}-${item.id}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.resultsListContent}
            />
          )}

          {showPremiumOverlay && (
            <View style={styles.premiumOverlay} testID="where-to-watch-premium-overlay">
              {Platform.OS === 'ios' ? (
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={styles.premiumOverlayFallback} />
              )}
              <View style={styles.premiumCard}>
                <Crown size={26} color={accentColor} />
                <Text style={styles.premiumTitle}>{t('whereToWatch.upgradeTitle')}</Text>
                <Text style={styles.premiumDescription}>{t('whereToWatch.upgradeDescription')}</Text>
                <Pressable
                  testID="where-to-watch-upgrade-button"
                  style={({ pressed }) => [
                    styles.upgradeButton,
                    { backgroundColor: accentColor },
                    pressed && styles.upgradeButtonPressed,
                  ]}
                  onPress={handleUpgradePress}
                >
                  <Text style={styles.upgradeButtonText}>{t('whereToWatch.upgradeButton')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>

      <Modal
        visible={isListModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsListModalVisible(false)}
      >
        <View style={modalLayoutStyles.container}>
          <ModalBackground />
          <Pressable style={modalLayoutStyles.backdrop} onPress={() => setIsListModalVisible(false)} />

          <View style={styles.modalCard}>
            <View style={modalHeaderStyles.header}>
              <Text style={modalHeaderStyles.title}>{t('whereToWatch.selectListTitle')}</Text>
              <Pressable onPress={() => setIsListModalVisible(false)} hitSlop={HIT_SLOP.m}>
                <X size={22} color={COLORS.text} />
              </Pressable>
            </View>
            <View style={styles.modalListContainer}>
              {isLoadingLists ? (
                <View style={styles.modalLoadingState}>
                  <ActivityIndicator size="small" color={accentColor} />
                  <Text style={styles.modalLoadingText}>{t('common.loading')}</Text>
                </View>
              ) : isListsError ? (
                <View style={styles.modalLoadingState}>
                  <Text style={styles.modalLoadingText}>{t('common.error')}</Text>
                  {!!listsError && (
                    <Text style={styles.modalErrorText} numberOfLines={2}>
                      {listsError instanceof Error ? listsError.message : t('errors.loadingFailed')}
                    </Text>
                  )}
                  <Pressable
                    testID="where-to-watch-list-retry-button"
                    style={({ pressed }) => [
                      styles.modalRetryButton,
                      { borderColor: accentColor },
                      pressed && styles.modalRetryButtonPressed,
                    ]}
                    onPress={() => refetchLists()}
                  >
                    <Text style={[styles.modalRetryText, { color: accentColor }]}>{t('common.retry')}</Text>
                  </Pressable>
                </View>
              ) : lists.length === 0 ? (
                <View style={styles.modalLoadingState}>
                  <Text style={styles.modalLoadingText}>{t('whereToWatch.emptyNoListDescription')}</Text>
                </View>
              ) : (
                <FlatList
                  data={lists}
                  keyExtractor={(item) => item.id}
                  style={styles.modalList}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = item.id === selectedListId;
                    const itemCount = Object.keys(item.items || {}).length;
                    return (
                      <Pressable
                        testID={`where-to-watch-list-option-${item.id}`}
                        style={({ pressed }) => [
                          styles.modalRow,
                          isSelected && {
                            borderColor: accentColor,
                            backgroundColor: hexToRGBA(accentColor, 0.12),
                          },
                          pressed && styles.modalRowPressed,
                        ]}
                        onPress={() => handleListSelect(item)}
                      >
                        <View style={styles.modalRowTextContainer}>
                          <Text style={styles.modalRowTitle}>{getDisplayListName(item, t)}</Text>
                          <Text style={styles.modalRowSubtitle}>
                            {itemCount === 1
                              ? t('library.itemCountOne')
                              : t('library.itemCount', { count: itemCount })}
                          </Text>
                        </View>
                        {isSelected && <Check size={20} color={accentColor} />}
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isServiceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsServiceModalVisible(false)}
      >
        <View style={modalLayoutStyles.container}>
          <ModalBackground />
          <Pressable style={modalLayoutStyles.backdrop} onPress={() => setIsServiceModalVisible(false)} />

          <View style={styles.modalCard}>
            <View style={modalHeaderStyles.header}>
              <Text style={modalHeaderStyles.title}>{t('whereToWatch.selectServiceTitle')}</Text>
              <Pressable onPress={() => setIsServiceModalVisible(false)} hitSlop={HIT_SLOP.m}>
                <X size={22} color={COLORS.text} />
              </Pressable>
            </View>
            <View style={styles.modalListContainer}>
              {(movieProvidersQuery.isLoading || tvProvidersQuery.isLoading) && visibleProviders.length === 0 ? (
                <View style={styles.modalLoadingState}>
                  <ActivityIndicator size="small" color={accentColor} />
                  <Text style={styles.modalLoadingText}>{t('common.loading')}</Text>
                </View>
              ) : visibleProviders.length === 0 ? (
                <View style={styles.modalLoadingState}>
                  <Text style={styles.modalLoadingText}>{t('whereToWatch.noServicesAvailable')}</Text>
                </View>
              ) : (
                <FlatList
                  data={visibleProviders}
                  keyExtractor={(item) => item.provider_id.toString()}
                  style={styles.modalList}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = selectedService?.provider_id === item.provider_id;
                    const matchCount = providerCounts.get(item.provider_id) || 0;

                    return (
                      <Pressable
                        testID={`where-to-watch-service-option-${item.provider_id}`}
                        style={({ pressed }) => [
                          styles.modalRow,
                          isSelected && {
                            borderColor: accentColor,
                            backgroundColor: hexToRGBA(accentColor, 0.12),
                          },
                          pressed && styles.modalRowPressed,
                        ]}
                        onPress={() => handleServiceSelect(item)}
                      >
                        <MediaImage
                          source={{ uri: getImageUrl(item.logo_path, '/w92') }}
                          style={styles.providerLogo}
                          contentFit="contain"
                        />
                        <View style={styles.modalRowTextContainer}>
                          <Text style={styles.modalRowTitle}>{item.provider_name}</Text>
                          {isLoadingEnrichment ? (
                            <View style={styles.providerCountLoading}>
                              <ActivityIndicator size="small" color={accentColor} />
                            </View>
                          ) : (
                            <Text style={styles.modalRowSubtitle}>
                              {t('whereToWatch.providerMatches', { count: matchCount })}
                            </Text>
                          )}
                        </View>
                        {isSelected && <Check size={20} color={accentColor} />}
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  introText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    lineHeight: 20,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
  },
  selectorButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.s,
    gap: SPACING.xs,
  },
  selectorPressed: {
    opacity: ACTIVE_OPACITY,
  },
  selectorDisabled: {
    opacity: 0.65,
  },
  selectorText: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  selectorTextDisabled: {
    color: COLORS.textSecondary,
  },
  selectorLogo: {
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  enrichmentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  enrichmentText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  resultsContainer: {
    flex: 1,
    position: 'relative',
  },
  resultsListContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.s,
    paddingBottom: SPACING.xl,
  },
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: SPACING.m,
    flexDirection: 'row',
    padding: SPACING.s,
    gap: SPACING.m,
  },
  resultCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  resultPoster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  resultInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  resultTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  mediaTypeBadge: {
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    paddingHorizontal: SPACING.s,
    paddingVertical: 4,
  },
  mediaTypeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultProviderLogo: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyIconContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.l,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  emptyDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    textAlign: 'center',
  },
  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
  },
  premiumOverlayFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  premiumCard: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    gap: SPACING.s,
    alignItems: 'center',
  },
  premiumTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.l,
    fontWeight: '700',
    textAlign: 'center',
  },
  premiumDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeButton: {
    marginTop: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s + 2,
  },
  upgradeButtonPressed: {
    opacity: ACTIVE_OPACITY,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONT_SIZE.s,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '78%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  modalListContainer: {
    minHeight: 220,
    maxHeight: 380,
  },
  modalList: {
    flexGrow: 0,
    width: '100%',
  },
  modalRow: {
    minHeight: 62,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    marginBottom: SPACING.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  modalRowPressed: {
    opacity: ACTIVE_OPACITY,
  },
  modalRowTextContainer: {
    flex: 1,
    gap: 2,
  },
  modalRowTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  modalRowSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  modalLoadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.s,
  },
  modalLoadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  modalErrorText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },
  modalRetryButton: {
    marginTop: SPACING.s,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs + 2,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.m,
  },
  modalRetryButtonPressed: {
    opacity: ACTIVE_OPACITY,
  },
  modalRetryText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  providerLogo: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.background,
  },
  providerCountLoading: {
    width: 18,
    height: 18,
    justifyContent: 'center',
  },
});
