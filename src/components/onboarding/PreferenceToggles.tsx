import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

interface PreferenceTogglesProps {
  showListIndicators: boolean;
  hideUnreleasedContent: boolean;
  hideTabLabels: boolean;
  dataSaver: boolean;
  onShowListIndicatorsChange: (value: boolean) => void;
  onHideUnreleasedContentChange: (value: boolean) => void;
  onHideTabLabelsChange: (value: boolean) => void;
  onDataSaverChange: (value: boolean) => void;
}

export function PreferenceToggles({
  showListIndicators,
  hideUnreleasedContent,
  hideTabLabels,
  dataSaver,
  onShowListIndicatorsChange,
  onHideUnreleasedContentChange,
  onHideTabLabelsChange,
  onDataSaverChange,
}: PreferenceTogglesProps) {
  const { t } = useTranslation();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Show List Indicators */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>{t('profile.showListIndicators')}</Text>
          <Text style={styles.toggleDescription}>{t('profile.showListIndicatorsDescription')}</Text>
        </View>
        <Switch
          value={showListIndicators}
          onValueChange={onShowListIndicatorsChange}
          trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>

      {/* Hide Unreleased Content */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>{t('profile.hideUnreleased')}</Text>
          <Text style={styles.toggleDescription}>{t('profile.hideUnreleasedDescription')}</Text>
        </View>
        <Switch
          value={hideUnreleasedContent}
          onValueChange={onHideUnreleasedContentChange}
          trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>

      {/* Hide Tab Bar Labels */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>{t('profile.hideTabLabels')}</Text>
          <Text style={styles.toggleDescription}>{t('profile.hideTabLabelsDescription')}</Text>
        </View>
        <Switch
          value={hideTabLabels}
          onValueChange={onHideTabLabelsChange}
          trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>

      {/* Data Saver */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>{t('profile.dataSaver')}</Text>
          <Text style={styles.toggleDescription}>{t('profile.dataSaverDescription')}</Text>
        </View>
        <Switch
          value={dataSaver}
          onValueChange={onDataSaverChange}
          trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
    gap: SPACING.m,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.l,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
  },
  toggleInfo: {
    flex: 1,
    marginRight: SPACING.m,
  },
  toggleTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  toggleDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
