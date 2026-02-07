import { tmdbApi } from '@/src/api/tmdb';
import { getTraktSlugByTmdbId } from '@/src/api/trakt';
import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import {
  buildOpenWithUrl,
  buildTraktAppUrlFromWeb,
  OpenWithServiceId,
} from '@/src/utils/openWithLinks';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Globe, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

const imdbLogo = require('../../../assets/images/imdb.png');
const lbLogo = require('../../../assets/images/lb.png');
const rtLogo = require('../../../assets/images/rt.png');
const mcLogo = require('../../../assets/images/mc.png');
const tmdbLogo = require('../../../assets/images/tmdb.png');

interface OpenWithDrawerProps {
  visible: boolean;
  onClose: () => void;
  mediaId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year?: string | null;
  onShowToast?: (message: string) => void;
}

type ServiceItem = {
  id: OpenWithServiceId;
  label: string;
  icon: React.ReactNode;
};

export default function OpenWithDrawer({
  visible,
  onClose,
  mediaId,
  mediaType,
  title,
  year,
  onShowToast,
}: OpenWithDrawerProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const sheetRef = useRef<TrueSheet>(null);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [traktSlug, setTraktSlug] = useState<string | null>(null);

  const services = useMemo<ServiceItem[]>(
    () => [
      {
        id: 'imdb',
        label: t('media.imdb'),
        icon: <Image source={imdbLogo} style={styles.imdbLogo} resizeMode="contain" />,
      },
      {
        id: 'trakt',
        label: t('media.trakt'),
        icon: <TraktLogo size={22} />,
      },
      {
        id: 'tmdb',
        label: t('media.tmdb'),
        icon: <Image source={tmdbLogo} style={styles.logo} resizeMode="contain" />,
      },
      {
        id: 'letterboxd',
        label: t('media.letterboxd'),
        icon: <Image source={lbLogo} style={styles.logo} resizeMode="contain" />,
      },
      {
        id: 'rottenTomatoes',
        label: t('media.rottenTomatoes'),
        icon: <Image source={rtLogo} style={styles.logo} resizeMode="contain" />,
      },
      {
        id: 'metacritic',
        label: t('media.metacritic'),
        icon: <Image source={mcLogo} style={styles.logo} resizeMode="contain" />,
      },
      {
        id: 'wikipedia',
        label: t('media.wikipedia'),
        icon: <Globe size={22} color={COLORS.text} />,
      },
      {
        id: 'webSearch',
        label: t('media.webSearch'),
        icon: <Search size={22} color={COLORS.text} />,
      },
    ],
    [t]
  );

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isMounted = true;
    setImdbId(null);
    setTraktSlug(null);

    const loadExternalIds = async () => {
      try {
        const [externalIds, slug] = await Promise.all([
          mediaType === 'movie'
            ? tmdbApi.getMovieExternalIds(mediaId)
            : tmdbApi.getTVExternalIds(mediaId),
          getTraktSlugByTmdbId(mediaId, mediaType),
        ]);

        if (!isMounted) {
          return;
        }

        setImdbId(externalIds.imdb_id);
        setTraktSlug(slug);
      } catch (error) {
        console.error('[OpenWithDrawer] Failed to load external links:', error);
      }
    };

    loadExternalIds();

    return () => {
      isMounted = false;
    };
  }, [visible, mediaId, mediaType]);

  const handleServicePress = useCallback(
    async (serviceId: OpenWithServiceId) => {
      const webUrl = buildOpenWithUrl({
        serviceId,
        mediaType,
        mediaId,
        title,
        year,
        imdbId,
        traktSlug,
      });

      try {
        if (serviceId === 'trakt') {
          const appUrl = buildTraktAppUrlFromWeb(webUrl);
          if (appUrl) {
            try {
              await Linking.openURL(appUrl);
              await sheetRef.current?.dismiss();
              return;
            } catch (appError) {
              console.warn('[OpenWithDrawer] Trakt app not available, opening website:', appError);
            }
          }
        }

        await Linking.openURL(webUrl);
        await sheetRef.current?.dismiss();
      } catch (error) {
        console.error('[OpenWithDrawer] Failed to open URL:', error);
        onShowToast?.(t('media.unableToOpenExternalLink'));
      }
    },
    [imdbId, mediaId, mediaType, onShowToast, t, title, traktSlug, year]
  );

  const handleDidDismiss = useCallback(() => {
    if (visible) {
      onClose();
    }
  }, [onClose, visible]);

  return (
    <TrueSheet
      ref={sheetRef}
      detents={['auto']}
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      onDidDismiss={handleDidDismiss}
      grabber={true}
    >
      <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
        <View style={modalHeaderStyles.header}>
          <Text style={modalHeaderStyles.title}>{t('media.openWith')}</Text>
        </View>

        <View style={styles.list}>
          {services.map((service, index) => {
            const isLast = index === services.length - 1;

            return (
              <Pressable
                key={service.id}
                style={[styles.row, !isLast && styles.rowBorder]}
                onPress={() => handleServicePress(service.id)}
                testID={`open-with-item-${service.id}`}
                accessibilityRole="button"
                accessibilityLabel={service.label}
              >
                <View style={styles.iconWrapper}>{service.icon}</View>
                <Text style={styles.label}>{service.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </GestureHandlerRootView>
    </TrueSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: SPACING.s,
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingVertical: SPACING.m,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surfaceLight,
  },
  iconWrapper: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '500',
  },
  logo: {
    width: 28,
    height: 28,
  },
  imdbLogo: {
    width: 46,
    height: 22,
  },
});
