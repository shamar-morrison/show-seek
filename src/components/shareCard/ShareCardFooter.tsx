import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { COLORS, FONT_FAMILY } from '@/src/constants/theme';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardText } from './CardText';
import { SHARE_CARD_LOGO_KEY } from './shareCardImages';
import { ShareCardFormat, ShareCardIdentity } from './shareCardTypes';

const SHOWSEEK_URL = 'show-seek.app';
const URL_COLOR = '#B5B3AE';

const FOOTER_SIZES: Record<
  ShareCardFormat,
  { avatar: number; name: number; logo: number; wordmark: number; url: number }
> = {
  portrait: { avatar: 104, name: 40, logo: 72, wordmark: 46, url: 30 },
  square: { avatar: 80, name: 34, logo: 60, wordmark: 38, url: 24 },
  landscape: { avatar: 88, name: 36, logo: 64, wordmark: 42, url: 28 },
};

interface ShareCardFooterProps {
  format: ShareCardFormat;
  identity: ShareCardIdentity | null;
  onImageSettled?: (key: string) => void;
}

export function ShareCardFooter({ format, identity, onImageSettled }: ShareCardFooterProps) {
  const sizes = FOOTER_SIZES[format];
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = identity?.photoUrl ?? null;
  const showPhoto = !!photoUrl && !photoFailed;

  return (
    <View style={[styles.footer, !identity && styles.footerBrandOnly]} testID="share-card-footer">
      {identity && (
        <View style={styles.identity} testID="share-card-identity">
          {showPhoto ? (
            <Image
              source={{ uri: photoUrl }}
              style={{ width: sizes.avatar, height: sizes.avatar, borderRadius: sizes.avatar / 2 }}
              contentFit="cover"
              onError={() => setPhotoFailed(true)}
              onLoadEnd={() => onImageSettled?.(photoUrl)}
            />
          ) : (
            <UserAvatar displayName={identity.displayName} size={sizes.avatar} />
          )}
          {identity.displayName && (
            <CardText style={[styles.name, { fontSize: sizes.name }]} numberOfLines={1}>
              {identity.displayName}
            </CardText>
          )}
        </View>
      )}

      <View style={styles.brand}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/share-card-logo.png')}
            style={{ width: sizes.logo, height: sizes.logo, borderRadius: sizes.logo * 0.22 }}
            contentFit="contain"
            onLoadEnd={() => onImageSettled?.(SHARE_CARD_LOGO_KEY)}
          />
          <CardText style={[styles.wordmark, { fontSize: sizes.wordmark }]}>ShowSeek</CardText>
        </View>
        <CardText style={[styles.url, { fontSize: sizes.url }]}>{SHOWSEEK_URL}</CardText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 32,
  },
  footerBrandOnly: {
    justifyContent: 'flex-end',
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  name: {
    flexShrink: 1,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
  },
  brand: {
    alignItems: 'flex-end',
    gap: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  wordmark: {
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  url: {
    fontFamily: FONT_FAMILY.regular,
    color: URL_COLOR,
  },
});
