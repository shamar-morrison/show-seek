import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import {
  Alert02Icon,
  Copy01Icon,
  Link02Icon,
  Share02Icon,
  Tick02Icon,
  Unlink01Icon,
} from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type StremioBusyAction = 'create' | 'revoke' | null;

interface StremioSetupGuideProps {
  installUrl: string | null;
  hasActiveLink: boolean;
  busyAction: StremioBusyAction;
  onCreatePress: () => void;
  onSharePress: () => void;
  onCopyPress: () => void;
  onDisconnectPress: () => void;
}

interface StepProps {
  number: number;
  title: string;
  body: string;
  isDone?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
}

function Step({ number, title, body, isDone = false, isLast = false, children }: StepProps) {
  const { accentColor } = useAccentColor();

  return (
    <View style={styles.step} testID={`stremio-step-${number}`}>
      <View style={styles.stepRail}>
        <View
          style={[
            styles.stepBadge,
            isDone ? { backgroundColor: accentColor, borderColor: accentColor } : null,
          ]}
        >
          {isDone ? (
            <AppIcon icon={Tick02Icon} size={16} color={COLORS.white} strokeWidth={2.5} />
          ) : (
            <Text style={styles.stepBadgeText}>{number}</Text>
          )}
        </View>
        {!isLast && <View style={styles.stepLine} />}
      </View>
      <View style={[styles.stepContent, isLast && styles.stepContentLast]}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
        {children}
      </View>
    </View>
  );
}

/** Step-by-step install walkthrough. The link stays in the parent's memory only. */
export function StremioSetupGuide({
  installUrl,
  hasActiveLink,
  busyAction,
  onCreatePress,
  onSharePress,
  onCopyPress,
  onDisconnectPress,
}: StremioSetupGuideProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const isBusy = busyAction !== null;
  const isCreating = busyAction === 'create';
  // An active link we can no longer show: offer a replacement, not a first-time create.
  const needsReplacement = hasActiveLink && !installUrl;

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('stremio.setup.title')}</Text>

      <Step
        number={1}
        title={t('stremio.setup.step1Title')}
        body={needsReplacement ? t('stremio.setup.step1Active') : t('stremio.setup.step1Body')}
        isDone={hasActiveLink}
      >
        {!installUrl && (
          <TouchableOpacity
            style={[
              styles.button,
              needsReplacement
                ? styles.outlineButton
                : [styles.filledButton, { backgroundColor: accentColor }],
            ]}
            onPress={onCreatePress}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isBusy}
            testID={needsReplacement ? 'stremio-create-new-button' : 'stremio-create-button'}
          >
            {isCreating ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <AppIcon icon={Link02Icon} size={18} color={COLORS.white} />
                <Text style={styles.buttonText}>
                  {needsReplacement ? t('stremio.createNewLink') : t('stremio.createLink')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </Step>

      <Step number={2} title={t('stremio.setup.step2Title')} body={t('stremio.setup.step2Body')}>
        {installUrl ? (
          <View testID="stremio-link-section">
            <View style={styles.linkBox}>
              <Text selectable style={styles.linkText} testID="stremio-install-url">
                {installUrl}
              </Text>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.filledButton,
                  styles.rowButton,
                  { backgroundColor: accentColor },
                ]}
                onPress={onSharePress}
                activeOpacity={ACTIVE_OPACITY}
                disabled={isBusy}
                testID="stremio-share-button"
              >
                <AppIcon icon={Share02Icon} size={18} color={COLORS.white} />
                <Text style={styles.buttonText}>{t('stremio.share')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.outlineButton, styles.rowButton]}
                onPress={onCopyPress}
                activeOpacity={ACTIVE_OPACITY}
                disabled={isBusy}
                testID="stremio-copy-button"
              >
                <AppIcon icon={Copy01Icon} size={18} color={COLORS.white} />
                <Text style={styles.buttonText}>{t('stremio.copy')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.linkWarning}>
              <AppIcon icon={Alert02Icon} size={16} color={COLORS.warningText} />
              <View style={styles.linkWarningTextGroup}>
                <Text style={styles.linkWarningText}>{t('stremio.shownOnce')}</Text>
                <Text style={styles.linkWarningText}>{t('stremio.private')}</Text>
              </View>
            </View>
          </View>
        ) : (
          !hasActiveLink && (
            <Text style={styles.pendingText}>{t('stremio.setup.step2Pending')}</Text>
          )
        )}
      </Step>

      <Step number={3} title={t('stremio.setup.step3Title')} body={t('stremio.setup.step3Body')} />
      <Step number={4} title={t('stremio.setup.step4Title')} body={t('stremio.setup.step4Body')} />
      <Step
        number={5}
        title={t('stremio.setup.step5Title')}
        body={t('stremio.setup.step5Body')}
        isLast
      />

      {hasActiveLink && (
        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={onDisconnectPress}
          activeOpacity={ACTIVE_OPACITY}
          disabled={isBusy}
          testID="stremio-disconnect-button"
        >
          {busyAction === 'revoke' ? (
            <ActivityIndicator color={COLORS.error} />
          ) : (
            <>
              <AppIcon icon={Unlink01Icon} size={18} color={COLORS.error} />
              <Text style={styles.disconnectButtonText}>{t('stremio.disconnect')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const BADGE_SIZE = 28;

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
    marginBottom: SPACING.m,
  },
  step: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  stepRail: {
    alignItems: 'center',
    width: BADGE_SIZE,
  },
  stepBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  stepLine: {
    flex: 1,
    width: 2,
    marginVertical: SPACING.xs,
    borderRadius: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  stepContent: {
    flex: 1,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.l,
  },
  stepContentLast: {
    paddingBottom: 0,
  },
  stepTitle: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  stepBody: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  pendingText: {
    marginTop: SPACING.s,
    fontSize: FONT_SIZE.xs,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    minHeight: 44,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    marginTop: SPACING.m,
  },
  filledButton: {
    borderWidth: 0,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surface,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
    flexShrink: 1, // wrap within its row instead of pushing siblings off
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  rowButton: {
    flex: 1,
    marginTop: SPACING.s,
  },
  linkBox: {
    marginTop: SPACING.m,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surface,
  },
  linkText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text,
    lineHeight: 18,
  },
  linkWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.s,
    marginTop: SPACING.m,
  },
  linkWarningTextGroup: {
    flex: 1,
    gap: SPACING.xs,
  },
  linkWarningText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.m,
    marginTop: SPACING.xl,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  disconnectButtonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.error,
  },
});
