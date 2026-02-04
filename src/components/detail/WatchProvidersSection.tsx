import { getImageUrl } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import i18n from '@/src/i18n';
import React, { memo } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDetailStyles } from './detailStyles';
import type { WatchProvider, WatchProviders, WatchProvidersSectionProps } from './types';

const hasAnyProviders = (providers: WatchProviders | null | undefined): boolean => {
  if (!providers) return false;
  return !!(
    (providers.flatrate && providers.flatrate.length > 0) ||
    (providers.rent && providers.rent.length > 0) ||
    (providers.buy && providers.buy.length > 0)
  );
};

const openJustWatchLink = async (link: string) => {
  try {
    const supported = await Linking.canOpenURL(link);
    if (supported) {
      await Linking.openURL(link);
    } else {
      Alert.alert(
        i18n.t('watchProviders.unableToOpenLinkTitle'),
        i18n.t('watchProviders.unableToOpenLinkMessage'),
        [{ text: i18n.t('common.ok') }]
      );
    }
  } catch (error) {
    console.error('Error opening JustWatch link:', error);
    Alert.alert(i18n.t('common.errorTitle'), i18n.t('watchProviders.openLinkErrorMessage'), [
      { text: i18n.t('common.ok') },
    ]);
  }
};

interface ProviderCategoryProps {
  label: string;
  providers: WatchProvider[];
  link?: string;
}

const ProviderCategory = ({ label, providers, link }: ProviderCategoryProps) => {
  const styles = useDetailStyles();

  return (
    <View style={styles.providersSection}>
      <Text style={styles.providerType}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {providers.map((provider) => {
          const handlePress = () => {
            if (link) {
              openJustWatchLink(link);
            }
          };

          // If link exists, make it pressable
          if (link) {
            return (
              <Pressable
                key={provider.provider_id}
                style={({ pressed }) => [styles.providerCard, { opacity: pressed ? 0.7 : 1 }]}
                onPress={handlePress}
                accessibilityRole="button"
                accessibilityLabel={i18n.t('watchProviders.accessibility.watchOnProviderViaJustWatch', {
                  provider: provider.provider_name,
                })}
                hitSlop={SPACING.s}
              >
                <MediaImage
                  source={{ uri: getImageUrl(provider.logo_path, '/w92') }}
                  style={styles.providerLogo}
                  contentFit="contain"
                />
                <Text style={styles.providerName} numberOfLines={1}>
                  {provider.provider_name}
                </Text>
              </Pressable>
            );
          }

          // Fallback: non-interactive view if no link
          return (
            <View key={provider.provider_id} style={styles.providerCard}>
              <MediaImage
                source={{ uri: getImageUrl(provider.logo_path, '/w92') }}
                style={styles.providerLogo}
                contentFit="contain"
              />
              <Text style={styles.providerName} numberOfLines={1}>
                {provider.provider_name}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export const WatchProvidersSection = memo<WatchProvidersSectionProps>(
  ({ watchProviders, link, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

    if (!hasAnyProviders(watchProviders)) {
      return null;
    }

    return (
      <View style={style}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={styles.sectionTitle}>{t('watchProviders.whereToWatch')}</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONT_SIZE.xs }}>
            {t('watchProviders.byJustWatch')}
          </Text>
        </View>

        {watchProviders!.flatrate && watchProviders!.flatrate.length > 0 && (
          <ProviderCategory
            label={t('watchProviders.streaming')}
            providers={watchProviders!.flatrate}
            link={link}
          />
        )}

        {watchProviders!.rent && watchProviders!.rent.length > 0 && (
          <ProviderCategory label={t('watchProviders.rent')} providers={watchProviders!.rent} link={link} />
        )}

        {watchProviders!.buy && watchProviders!.buy.length > 0 && (
          <ProviderCategory label={t('watchProviders.buy')} providers={watchProviders!.buy} link={link} />
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check if watch providers data changed
    return (
      prevProps.style === nextProps.style &&
      prevProps.link === nextProps.link &&
      prevProps.watchProviders?.flatrate === nextProps.watchProviders?.flatrate &&
      prevProps.watchProviders?.rent === nextProps.watchProviders?.rent &&
      prevProps.watchProviders?.buy === nextProps.watchProviders?.buy
    );
  }
);

WatchProvidersSection.displayName = 'WatchProvidersSection';
