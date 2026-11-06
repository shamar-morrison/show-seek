import { AppIcon, IconSvgElement } from '@/src/components/ui/AppIcon';
import { COLORS, FONT_FAMILY, hexToRGBA } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { StarIcon } from '@hugeicons/core-free-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { CardText } from './CardText';
import { ShareCardFooter } from './ShareCardFooter';
import { ShareCardContent } from './shareCardContent';
import { ShareCardImages } from './shareCardImages';
import { SHARE_CARD_BACKGROUND, ShareCardFormat, ShareCardIdentity } from './shareCardTypes';

const FALLBACK_GRADIENT = ['#1a1a2e', '#16213e', '#0f3460'] as const;
const NOTE_COLOR = '#E8E6E1';

const CENTERED_LAYOUT = {
  // The extra top and bottom padding keeps content clear of Instagram's Stories controls.
  portrait: {
    paddingHorizontal: 72,
    paddingTop: 120,
    paddingBottom: 160,
    foregroundWidth: 560,
    foregroundHeight: 840,
    foregroundRadius: 32,
    eyebrow: 32,
    title: 88,
    titleLineHeight: 100,
    titleLines: 3,
    meta: 40,
    note: 38,
    noteLineHeight: 52,
    noteLines: 4,
    noteMarginTop: 64,
    pillValue: 56,
    pillLabel: 32,
    pillPadding: 32,
    progressHeight: 16,
    progressLabel: 40,
    sectionGap: 40,
  },
  square: {
    paddingHorizontal: 64,
    paddingTop: 56,
    paddingBottom: 56,
    foregroundWidth: 760,
    foregroundHeight: 428,
    foregroundRadius: 28,
    eyebrow: 26,
    title: 64,
    titleLineHeight: 74,
    titleLines: 2,
    meta: 32,
    note: 30,
    noteLineHeight: 40,
    noteLines: 3,
    noteMarginTop: 40,
    pillValue: 40,
    pillLabel: 26,
    pillPadding: 20,
    progressHeight: 12,
    progressLabel: 30,
    sectionGap: 24,
  },
} as const;

const LANDSCAPE_POSTER_RADIUS = 32;

const LANDSCAPE_LAYOUT = {
  padding: 80,
  paddingBottom: 72,
  eyebrow: 30,
  title: 88,
  titleLineHeight: 100,
  titleLines: 3,
  meta: 38,
  note: 36,
  noteLineHeight: 48,
  noteLines: 3,
  noteMarginTop: 56,
  pillValue: 52,
  pillLabel: 30,
  pillPadding: 28,
  progressHeight: 14,
  progressLabel: 36,
  sectionGap: 40,
} as const;

interface ShareCardLayoutProps {
  content: ShareCardContent;
  images: ShareCardImages;
  format: ShareCardFormat;
  identity: ShareCardIdentity | null;
  note?: string | null;
  onImageSettled?: (key: string) => void;
}

/** The layout every card type shares, one arrangement for each size. */
export function ShareCardLayout({
  content,
  images,
  format,
  identity,
  note,
  onImageSettled,
}: ShareCardLayoutProps) {
  const footer = (
    <ShareCardFooter format={format} identity={identity} onImageSettled={onImageSettled} />
  );

  return (
    <View style={styles.container}>
      {images.backgroundUrl ? (
        <Image
          source={{ uri: images.backgroundUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={40}
          onLoadEnd={() => onImageSettled?.(images.backgroundUrl!)}
        />
      ) : (
        <LinearGradient colors={[...FALLBACK_GRADIENT]} style={StyleSheet.absoluteFill} />
      )}

      {format === 'landscape' ? (
        <LandscapeContent
          content={content}
          images={images}
          note={note}
          footer={footer}
          onImageSettled={onImageSettled}
        />
      ) : (
        <CenteredContent
          content={content}
          format={format}
          images={images}
          note={note}
          footer={footer}
          onImageSettled={onImageSettled}
        />
      )}
    </View>
  );
}

interface ContentProps {
  content: ShareCardContent;
  images: ShareCardImages;
  note?: string | null;
  footer: React.ReactNode;
  onImageSettled?: (key: string) => void;
}

function CenteredContent({
  content,
  format,
  images,
  note,
  footer,
  onImageSettled,
}: ContentProps & { format: 'portrait' | 'square' }) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const layout = CENTERED_LAYOUT[format];
  const { foregroundUrl } = images;
  const rating = getRatingStat(content.userRating, t);
  const { meta } = content;
  // A poster standing in for a missing backdrop keeps its own shape instead of being cropped.
  const foregroundAspectRatio = images.foregroundIsPosterFallback
    ? 2 / 3
    : layout.foregroundWidth / layout.foregroundHeight;

  return (
    <>
      <LinearGradient
        colors={[
          hexToRGBA(SHARE_CARD_BACKGROUND, 0.4),
          hexToRGBA(SHARE_CARD_BACKGROUND, 0.65),
          hexToRGBA(SHARE_CARD_BACKGROUND, 0.92),
        ]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.centeredContent,
          {
            paddingHorizontal: layout.paddingHorizontal,
            paddingTop: layout.paddingTop,
            paddingBottom: layout.paddingBottom,
          },
        ]}
      >
        <View style={styles.centeredDetails}>
          {foregroundUrl && (
            <ForegroundImage
              url={foregroundUrl}
              radius={layout.foregroundRadius}
              frameStyle={{
                height: layout.foregroundHeight,
                aspectRatio: foregroundAspectRatio,
                marginBottom: layout.sectionGap,
              }}
              onImageSettled={onImageSettled}
            />
          )}
          {!!content.eyebrow && (
            <CardText
              style={[styles.eyebrow, styles.centeredText, { fontSize: layout.eyebrow }]}
              numberOfLines={1}
              testID="share-card-eyebrow"
            >
              {content.eyebrow}
            </CardText>
          )}
          <CardText
            style={[
              styles.title,
              styles.centeredText,
              { fontSize: layout.title, lineHeight: layout.titleLineHeight },
            ]}
            numberOfLines={layout.titleLines}
            testID="share-card-title"
          >
            {content.headline}
          </CardText>
          {!!meta && (
            <CardText
              style={[styles.meta, styles.centeredText, { fontSize: layout.meta }]}
              numberOfLines={1}
            >
              {meta}
            </CardText>
          )}
          {!!note && (
            <NoteText
              note={note}
              fontSize={layout.note}
              lineHeight={layout.noteLineHeight}
              numberOfLines={layout.noteLines}
              marginTop={layout.noteMarginTop}
              centered
            />
          )}
          {rating && (
            <StatPill
              stat={rating}
              accentColor={accentColor}
              valueSize={layout.pillValue}
              labelSize={layout.pillLabel}
              style={[
                styles.centeredStat,
                {
                  marginTop: layout.sectionGap,
                  paddingVertical: layout.pillPadding,
                  paddingHorizontal: layout.pillPadding * 2,
                },
              ]}
            />
          )}
          {content.progress && (
            <ProgressMeter
              {...content.progress}
              accentColor={accentColor}
              height={layout.progressHeight}
              labelSize={layout.progressLabel}
              marginTop={layout.sectionGap}
            />
          )}
        </View>
        <View style={{ marginTop: layout.sectionGap }}>{footer}</View>
      </View>
    </>
  );
}

function LandscapeContent({ content, images, note, footer, onImageSettled }: ContentProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const layout = LANDSCAPE_LAYOUT;
  const { foregroundUrl } = images;
  const { meta } = content;
  const rating = getRatingStat(content.userRating, t);

  return (
    <>
      <LinearGradient
        colors={[hexToRGBA(SHARE_CARD_BACKGROUND, 0.72), hexToRGBA(SHARE_CARD_BACKGROUND, 0.9)]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.landscapeContent,
          { padding: layout.padding, paddingBottom: layout.paddingBottom },
        ]}
      >
        {foregroundUrl && (
          <ForegroundImage
            url={foregroundUrl}
            radius={LANDSCAPE_POSTER_RADIUS}
            frameStyle={styles.landscapePoster}
            onImageSettled={onImageSettled}
          />
        )}
        <View style={styles.landscapeColumn}>
          <View style={styles.landscapeDetails}>
            {!!content.eyebrow && (
              <CardText
                style={[styles.eyebrow, { fontSize: layout.eyebrow }]}
                numberOfLines={1}
                testID="share-card-eyebrow"
              >
                {content.eyebrow}
              </CardText>
            )}
            <CardText
              style={[styles.title, { fontSize: layout.title, lineHeight: layout.titleLineHeight }]}
              numberOfLines={layout.titleLines}
              testID="share-card-title"
            >
              {content.headline}
            </CardText>
            {!!meta && (
              <CardText style={[styles.meta, { fontSize: layout.meta }]} numberOfLines={1}>
                {meta}
              </CardText>
            )}
            {!!note && (
              <NoteText
                note={note}
                fontSize={layout.note}
                lineHeight={layout.noteLineHeight}
                numberOfLines={layout.noteLines}
                marginTop={layout.noteMarginTop}
              />
            )}
            {rating && (
              <StatPill
                stat={rating}
                accentColor={accentColor}
                valueSize={layout.pillValue}
                labelSize={layout.pillLabel}
                style={[
                  styles.landscapeStat,
                  { marginTop: layout.sectionGap, padding: layout.pillPadding },
                ]}
              />
            )}
            {content.progress && (
              <ProgressMeter
                {...content.progress}
                accentColor={accentColor}
                height={layout.progressHeight}
                labelSize={layout.progressLabel}
                marginTop={layout.sectionGap}
              />
            )}
          </View>
          {footer}
        </View>
      </View>
    </>
  );
}

interface ForegroundImageProps {
  url: string;
  radius: number;
  frameStyle: ViewStyle;
  onImageSettled?: (key: string) => void;
}

function ForegroundImage({ url, radius, frameStyle, onImageSettled }: ForegroundImageProps) {
  return (
    <View
      style={[styles.foregroundFrame, { borderRadius: radius, ...frameStyle }]}
      testID="share-card-foreground-frame"
    >
      <Image
        source={{ uri: url }}
        style={[styles.fill, { borderRadius: radius }]}
        contentFit="cover"
        onLoadEnd={() => onImageSettled?.(url)}
        testID="share-card-foreground"
      />
    </View>
  );
}

interface NoteTextProps {
  note: string;
  fontSize: number;
  lineHeight: number;
  numberOfLines: number;
  marginTop: number;
  centered?: boolean;
}

function NoteText({
  note,
  fontSize,
  lineHeight,
  numberOfLines,
  marginTop,
  centered = false,
}: NoteTextProps) {
  return (
    <CardText
      style={[styles.note, centered && styles.centeredText, { fontSize, lineHeight, marginTop }]}
      numberOfLines={numberOfLines}
      testID="share-card-note"
    >
      {`\u201C${note}\u201D`}
    </CardText>
  );
}

interface Stat {
  icon: IconSvgElement;
  value: string;
  label: string;
  filled?: boolean;
}

interface StatPillProps {
  stat: Stat;
  accentColor: string;
  valueSize: number;
  labelSize: number;
  style: React.ComponentProps<typeof View>['style'];
}

function StatPill({ stat, accentColor, valueSize, labelSize, style }: StatPillProps) {
  return (
    <View style={[styles.stat, style]} testID="share-card-stat">
      <View style={styles.statValueRow}>
        <AppIcon
          icon={stat.icon}
          size={valueSize}
          color={accentColor}
          fill={stat.filled ? accentColor : undefined}
        />
        <CardText style={[styles.statValue, { fontSize: valueSize }]} numberOfLines={1}>
          {stat.value}
        </CardText>
      </View>
      <CardText style={[styles.statLabel, { fontSize: labelSize }]} numberOfLines={1}>
        {stat.label}
      </CardText>
    </View>
  );
}

interface ProgressMeterProps {
  current: number;
  total: number;
  accentColor: string;
  height: number;
  labelSize: number;
  marginTop: number;
}

function ProgressMeter({
  current,
  total,
  accentColor,
  height,
  labelSize,
  marginTop,
}: ProgressMeterProps) {
  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const radius = height / 2;

  return (
    <View style={[styles.progress, { marginTop }]} testID="share-card-progress">
      <View style={[styles.progressTrack, { height, borderRadius: radius }]}>
        <View
          style={{
            width: `${percentage}%`,
            height: '100%',
            borderRadius: radius,
            backgroundColor: accentColor,
          }}
          testID="share-card-progress-fill"
        />
      </View>
      <CardText style={[styles.progressLabel, { fontSize: labelSize }]}>
        {`${current}/${total}`}
      </CardText>
    </View>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function getRatingStat(userRating: number, t: Translate): Stat | null {
  if (userRating <= 0) return null;

  const rating = Number.isInteger(userRating) ? userRating : userRating.toFixed(1);
  return {
    icon: StarIcon,
    value: `${rating}/10`,
    label: t('shareCard.myRating'),
    filled: true,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SHARE_CARD_BACKGROUND,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  centeredContent: {
    flex: 1,
  },
  centeredDetails: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foregroundFrame: {
    // Full size unless the text below it would otherwise push the card's content off screen.
    flexShrink: 1,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  centeredText: {
    textAlign: 'center',
  },
  centeredStat: {
    alignItems: 'center',
  },
  landscapeContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 72,
  },
  landscapePoster: {
    width: 620,
    height: '100%',
  },
  landscapeColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  landscapeDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  landscapeStat: {
    alignSelf: 'flex-start',
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.textSecondary,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  meta: {
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
    marginTop: 16,
  },
  note: {
    fontFamily: FONT_FAMILY.boldItalic,
    color: NOTE_COLOR,
  },
  stat: {
    gap: 8,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statValue: {
    flexShrink: 1,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  progress: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  progressTrack: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressLabel: {
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
  },
  statLabel: {
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
  },
});
