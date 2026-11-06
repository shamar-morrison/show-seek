import React, { forwardRef } from 'react';
import { View } from 'react-native';

import { TitleShareCard } from './TitleShareCard';
import {
  SHARE_CARD_BACKGROUND,
  SHARE_CARD_DIMENSIONS,
  ShareCardData,
  ShareCardFormat,
  ShareCardIdentity,
} from './shareCardTypes';

interface ShareCardProps {
  data: ShareCardData;
  format: ShareCardFormat;
  identity: ShareCardIdentity | null;
  note?: string | null;
  onImageSettled?: (key: string) => void;
}

/** Renders a card at its full export size. Callers scale it down to preview it. */
export const ShareCard = forwardRef<View, ShareCardProps>(
  ({ data, format, identity, note, onImageSettled }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      style={{
        ...SHARE_CARD_DIMENSIONS[format],
        backgroundColor: SHARE_CARD_BACKGROUND,
        overflow: 'hidden',
      }}
    >
      <TitleShareCard
        data={data}
        format={format}
        identity={identity}
        note={note}
        onImageSettled={onImageSettled}
      />
    </View>
  )
);

ShareCard.displayName = 'ShareCard';
