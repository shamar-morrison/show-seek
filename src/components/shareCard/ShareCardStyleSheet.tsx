import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

import { ShareCard } from './ShareCard';
import {
  SHARE_CARD_DIMENSIONS,
  SHARE_CARD_STYLE_KEYS,
  ShareCardData,
  ShareCardFormat,
  ShareCardIdentity,
  ShareCardStyle,
} from './shareCardTypes';

const THUMBNAIL_GAP = SPACING.m;
const THUMBNAIL_COUNT = SHARE_CARD_STYLE_KEYS.length;

export interface ShareCardStyleSheetRef {
  present: () => void;
}

interface ShareCardStyleSheetProps {
  data: ShareCardData;
  format: ShareCardFormat;
  identity: ShareCardIdentity | null;
  note: string | null;
  activeStyle: ShareCardStyle;
  onSelect: (style: ShareCardStyle) => void;
}

/** Previews the user's actual card in each style. */
export const ShareCardStyleSheet = forwardRef<ShareCardStyleSheetRef, ShareCardStyleSheetProps>(
  ({ data, format, identity, note, activeStyle, onSelect }, ref) => {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const { width } = useWindowDimensions();
    const sheetRef = useRef<TrueSheet>(null);
    // Each preview is a full card, so only render them while the sheet is open.
    const [isOpen, setIsOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      present: () => {
        setIsOpen(true);
        void sheetRef.current?.present();
      },
    }));

    const handleSelect = (style: ShareCardStyle) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(style);
      void sheetRef.current?.dismiss();
    };

    const boxWidth =
      (width - SPACING.l * 2 - THUMBNAIL_GAP * (THUMBNAIL_COUNT - 1)) / THUMBNAIL_COUNT;
    const boxHeight = (boxWidth * 16) / 9;
    const dimensions = SHARE_CARD_DIMENSIONS[format];
    const scale = Math.min(boxWidth / dimensions.width, boxHeight / dimensions.height);

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
        onDidDismiss={() => setIsOpen(false)}
      >
        <GestureHandlerRootView style={[styles.content, { width }]}>
          <Text style={styles.title}>{t('shareCard.styleSheetTitle')}</Text>
          {isOpen && (
            <View style={styles.options}>
              {SHARE_CARD_STYLE_KEYS.map((style) => {
                const isActive = style === activeStyle;

                return (
                  <Pressable
                    key={style}
                    style={[styles.option, { width: boxWidth }]}
                    onPress={() => handleSelect(style)}
                    accessibilityRole="button"
                    accessibilityLabel={t(`shareCard.style_${style}`)}
                    accessibilityState={{ selected: isActive }}
                    testID={`share-card-style-option-${style}`}
                  >
                    <View style={[styles.box, { height: boxHeight }]}>
                      <View
                        pointerEvents="none"
                        style={[
                          styles.thumbnail,
                          {
                            width: dimensions.width * scale,
                            height: dimensions.height * scale,
                          },
                          isActive && { borderColor: accentColor },
                        ]}
                      >
                        <View
                          style={{
                            ...dimensions,
                            transform: [{ scale }],
                            transformOrigin: 'top left',
                          }}
                        >
                          <ShareCard
                            data={data}
                            format={format}
                            identity={identity}
                            note={note}
                            cardStyle={style}
                          />
                        </View>
                      </View>
                    </View>
                    <Text
                      style={[styles.label, isActive && { color: accentColor }]}
                      numberOfLines={2}
                    >
                      {t(`shareCard.style_${style}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

ShareCardStyleSheet.displayName = 'ShareCardStyleSheet';

const styles = StyleSheet.create({
  content: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  options: {
    flexDirection: 'row',
    gap: THUMBNAIL_GAP,
  },
  option: {
    gap: SPACING.s,
  },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 2,
    borderColor: COLORS.surfaceLight,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
