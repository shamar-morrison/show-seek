import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING, hexToRGBA } from '@/src/constants/theme';
import { AccentColorContext } from '@/src/context/AccentColorProvider';
import { classifyErrorKind, getTechnicalErrorMessage } from '@/src/utils/errorPresentation';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Clock, Globe } from 'lucide-react-native';
import React, { memo, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface AppErrorStateProps {
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  testID?: string;
  retryTestID?: string;
  secondaryActionTestID?: string;
  accentColor?: string;
}

export const AppErrorState = memo<AppErrorStateProps>(
  ({
    error,
    title,
    message,
    onRetry,
    retryLabel,
    onSecondaryAction,
    secondaryActionLabel,
    testID,
    retryTestID,
    secondaryActionTestID,
    accentColor,
  }) => {
    const { t } = useTranslation();
    const accentContext = useContext(AccentColorContext);
    const resolvedAccentColor = accentColor ?? accentContext?.accentColor ?? DEFAULT_ACCENT_COLOR;

    const kind = classifyErrorKind(error);
    const technicalMessage = getTechnicalErrorMessage(error);

    const friendlyMessage =
      kind === 'network'
        ? t('errors.networkError')
        : kind === 'timeout'
          ? t('errors.timeout')
          : message ?? t('errors.generic');

    const Icon = kind === 'network' ? Globe : kind === 'timeout' ? Clock : AlertCircle;

    return (
      <View style={styles.container} testID={testID}>
        <LinearGradient
          colors={[
            hexToRGBA(resolvedAccentColor, 0.28),
            hexToRGBA(resolvedAccentColor, 0.08),
            COLORS.background,
          ]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backgroundGradient}
        />

        <View style={styles.card}>
          <View style={[styles.iconHalo, { backgroundColor: hexToRGBA(resolvedAccentColor, 0.18) }]}> 
            <Icon size={30} color={resolvedAccentColor} />
          </View>

          <Text style={styles.title}>{title ?? t('common.error')}</Text>
          <Text style={styles.message}>{friendlyMessage}</Text>

          {__DEV__ && technicalMessage && technicalMessage !== friendlyMessage ? (
            <View style={styles.technicalBlock}>
              <Text style={styles.technicalLabel}>Debug</Text>
              <Text style={styles.technicalMessage}>{technicalMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {onRetry ? (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: resolvedAccentColor }]}
                onPress={onRetry}
                testID={retryTestID}
              >
                <Text style={styles.primaryButtonText}>{retryLabel ?? t('common.retry')}</Text>
              </TouchableOpacity>
            ) : null}

            {onSecondaryAction ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onSecondaryAction}
                testID={secondaryActionTestID}
              >
                <Text style={[styles.secondaryButtonText, { color: resolvedAccentColor }]}> 
                  {secondaryActionLabel ?? t('common.goBack')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  }
);

AppErrorState.displayName = 'AppErrorState';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.l,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: hexToRGBA(COLORS.white, 0.1),
    backgroundColor: hexToRGBA(COLORS.surface, 0.86),
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  iconHalo: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.m,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    marginBottom: SPACING.s,
    textAlign: 'center',
  },
  message: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    textAlign: 'center',
  },
  technicalBlock: {
    width: '100%',
    marginTop: SPACING.m,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: hexToRGBA(COLORS.white, 0.14),
    backgroundColor: hexToRGBA(COLORS.black, 0.35),
  },
  technicalLabel: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  technicalMessage: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    marginTop: SPACING.l,
    gap: SPACING.s,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: BORDER_RADIUS.l,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.l,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: hexToRGBA(COLORS.white, 0.2),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.l,
    backgroundColor: hexToRGBA(COLORS.black, 0.26),
  },
  secondaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
});

export default AppErrorState;
