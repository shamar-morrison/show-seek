import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ShareCardLayout } from './ShareCardLayout';
import { getShareCardContent } from './shareCardContent';
import { resolveShareCardImages } from './shareCardImages';
import {
  SHARE_CARD_BACKGROUND,
  SHARE_CARD_DIMENSIONS,
  ShareCardData,
  ShareCardFormat,
  ShareCardIdentity,
  ShareCardStyle,
} from './shareCardTypes';

interface ShareCardProps {
  data: ShareCardData;
  format: ShareCardFormat;
  identity: ShareCardIdentity | null;
  note?: string | null;
  cardStyle?: ShareCardStyle;
  onImageSettled?: (key: string) => void;
}

/** Renders a card at its full export size. Callers scale it down to preview it. */
export const ShareCard = forwardRef<View, ShareCardProps>(
  ({ data, format, identity, note, cardStyle = 'classic', onImageSettled }, ref) => {
    const { t } = useTranslation();

    return (
      <View
        ref={ref}
        collapsable={false}
        style={{
          ...SHARE_CARD_DIMENSIONS[format],
          backgroundColor: SHARE_CARD_BACKGROUND,
          overflow: 'hidden',
        }}
      >
        <ShareCardLayout
          content={getShareCardContent(data, t)}
          images={resolveShareCardImages(data, format, cardStyle)}
          format={format}
          cardStyle={cardStyle}
          identity={identity}
          note={note}
          onImageSettled={onImageSettled}
        />
      </View>
    );
  }
);

ShareCard.displayName = 'ShareCard';
