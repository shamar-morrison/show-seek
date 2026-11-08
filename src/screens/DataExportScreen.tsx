import {
  DataExportInfoSheet,
  type DataExportInfoSheetRef,
} from '@/src/components/profile/DataExportInfoSheet';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { exportUserData, type ExportFormat } from '@/src/services/DataExportService';
import { screenStyles } from '@/src/styles/screenStyles';
import {
  CheckmarkCircle02Icon,
  Download01Icon,
  File01Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FORMATS: ExportFormat[] = ['csv', 'markdown'];
/** Shared by the format icon and the title's line box so their tops line up. */
const FORMAT_ROW_HEIGHT = 22;

export default function DataExportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const requireAccount = useAccountRequired();
  const { accentColor } = useAccentColor();
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const isMountedRef = useRef(true);
  const infoSheetRef = useRef<DataExportInfoSheetRef>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderIconButton
          onPress={() => {
            void infoSheetRef.current?.present();
          }}
          accessibilityLabel={t('dataExport.infoButtonLabel')}
          testID="data-export-info-button"
        >
          <AppIcon icon={InformationCircleIcon} size={22} color={COLORS.text} />
        </HeaderIconButton>
      ),
    });
  }, [navigation, t]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  const handleSelectFormat = useCallback((next: ExportFormat) => {
    Haptics.selectionAsync();
    setFormat(next);
  }, []);

  const handleExport = useCallback(async () => {
    if (isExporting || requireAccount()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExporting(true);
    try {
      await exportUserData(format);
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert(t('profile.exportFailedTitle'), t('profile.exportFailedFallbackMessage'));
    } finally {
      if (isMountedRef.current) {
        setIsExporting(false);
      }
    }
  }, [format, isExporting, requireAccount, t]);

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(accentColor, 0.16) }]}>
            <AppIcon icon={Download01Icon} size={32} color={accentColor} />
          </View>
          <Text style={styles.heroTitle}>{t('dataExport.title')}</Text>
          <Text style={styles.heroBody}>{t('dataExport.body')}</Text>
        </View>

        <View style={styles.stageCard}>
          <Text style={styles.sectionLabel}>{t('dataExport.formatTitle')}</Text>
          <View style={styles.formatList} accessibilityRole="radiogroup">
            {FORMATS.map((option) => {
              const isSelected = option === format;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.formatCard,
                    isSelected && {
                      borderColor: accentColor,
                      backgroundColor: hexToRGBA(accentColor, 0.1),
                    },
                  ]}
                  onPress={() => handleSelectFormat(option)}
                  activeOpacity={ACTIVE_OPACITY}
                  disabled={isExporting}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled: isExporting }}
                  testID={`data-export-format-${option}`}
                >
                  <AppIcon
                    icon={isSelected ? CheckmarkCircle02Icon : File01Icon}
                    size={FORMAT_ROW_HEIGHT}
                    color={isSelected ? accentColor : COLORS.textSecondary}
                  />
                  <View style={styles.formatTextContainer}>
                    <Text style={styles.formatTitle}>
                      {t(`dataExport.formats.${option}.title`)}
                    </Text>
                    <Text style={styles.formatDescription}>
                      {t(`dataExport.formats.${option}.description`)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.exportButton,
              { backgroundColor: accentColor },
              isExporting && styles.exportButtonBusy,
            ]}
            onPress={handleExport}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isExporting}
            accessibilityRole="button"
            accessibilityState={{ disabled: isExporting, busy: isExporting }}
            testID="data-export-start"
          >
            {isExporting ? (
              <>
                <ActivityIndicator color={COLORS.white} testID="data-export-loading" />
                <Text style={styles.exportButtonText}>{t('dataExport.exporting')}</Text>
              </>
            ) : (
              <>
                <AppIcon icon={Download01Icon} size={18} color={COLORS.white} />
                <Text style={styles.exportButtonText}>{t('dataExport.exportButton')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <DataExportInfoSheet ref={infoSheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  exportButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: SPACING.m,
    width: '100%',
  },
  exportButtonBusy: {
    opacity: 0.7,
  },
  exportButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  formatCard: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceLight,
    borderColor: 'transparent',
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: SPACING.m,
    padding: SPACING.m,
  },
  formatDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
  formatList: {
    gap: SPACING.s,
  },
  formatTextContainer: {
    flex: 1,
    gap: 2,
  },
  formatTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
    lineHeight: FORMAT_ROW_HEIGHT,
  },
  heroBody: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    textAlign: 'center',
  },
  heroIconCircle: {
    alignItems: 'center',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginBottom: SPACING.m,
    width: 72,
  },
  heroSection: {
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.s,
  },
  heroTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    textAlign: 'center',
  },
  scrollContent: {
    gap: SPACING.l,
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  sectionLabel: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.s,
    textTransform: 'uppercase',
  },
  stageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.m,
    padding: SPACING.l,
  },
});
