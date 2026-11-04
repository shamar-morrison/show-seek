import { AppIcon, type IconSvgElement } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  ComputerIcon,
  HelpCircleIcon,
  PlayCircleIcon,
  Wifi01Icon,
} from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

const FAQ_KEYS = ['watched', 'updates', 'devices', 'anime', 'privacy', 'stop'] as const;
const TROUBLE_KEYS = ['trouble1', 'trouble2', 'trouble3', 'trouble4'] as const;

/** Plain-language explanation of what the Stremio addon does and doesn't do. */
export function StremioHowItWorks() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const flow: readonly { label: string; icon: IconSvgElement; color: string }[] = [
    { label: t('stremio.how.flowWatch'), icon: PlayCircleIcon, color: accentColor },
    { label: t('stremio.how.flowNotify'), icon: Wifi01Icon, color: accentColor },
    { label: t('stremio.how.flowMarked'), icon: CheckmarkCircle02Icon, color: COLORS.success },
  ];

  return (
    <View testID="stremio-how-it-works">
      <View style={styles.platformNotice} testID="stremio-platform-notice">
        <AppIcon icon={ComputerIcon} size={20} color={COLORS.warningText} />
        <Text style={styles.platformNoticeText}>{t('stremio.platformNotice')}</Text>
      </View>

      <View style={styles.flowCard}>
        {flow.map((node, index) => (
          <React.Fragment key={node.label}>
            {index > 0 && (
              <View style={styles.flowArrow}>
                <AppIcon icon={ArrowRight01Icon} size={16} color={COLORS.textSecondary} />
              </View>
            )}
            <View style={styles.flowNode}>
              <View style={[styles.flowIcon, { backgroundColor: `${node.color}26` }]}>
                <AppIcon icon={node.icon} size={22} color={node.color} />
              </View>
              <Text style={styles.flowLabel}>{node.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {FAQ_KEYS.map((key) => (
        <View key={key} style={styles.faqItem} testID={`stremio-faq-${key}`}>
          <Text style={styles.faqTitle}>{t(`stremio.how.${key}Title`)}</Text>
          <Text style={styles.faqBody}>{t(`stremio.how.${key}Body`)}</Text>
        </View>
      ))}

      <View style={styles.troubleCard}>
        <View style={styles.troubleHeader}>
          <AppIcon icon={HelpCircleIcon} size={20} color={COLORS.white} />
          <Text style={styles.troubleTitle}>{t('stremio.how.troubleTitle')}</Text>
        </View>
        {TROUBLE_KEYS.map((key) => (
          <View key={key} style={styles.troubleRow}>
            <View style={[styles.bullet, { backgroundColor: accentColor }]} />
            <Text style={styles.troubleText}>{t(`stremio.how.${key}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  platformNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.s,
    padding: SPACING.m,
    marginBottom: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    backgroundColor: COLORS.warningBackground,
  },
  platformNoticeText: {
    flex: 1,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.warningText,
    lineHeight: 20,
  },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.m,
    marginBottom: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.surface,
  },
  flowNode: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.s,
  },
  flowIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  flowArrow: {
    height: 48,
    justifyContent: 'center',
  },
  faqItem: {
    marginBottom: SPACING.l,
  },
  faqTitle: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  faqBody: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  troubleCard: {
    padding: SPACING.m,
    gap: SPACING.s,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surface,
  },
  troubleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.xs,
  },
  troubleTitle: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
  },
  troubleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.s,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  troubleText: {
    flex: 1,
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
