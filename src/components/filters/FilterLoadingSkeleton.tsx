import { COLORS } from '@/src/constants/theme';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { filterSelectStyles as styles } from './filterSelectStyles';

export function FilterLoadingSkeleton({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectLabel}>{label}</Text>
      <View style={[styles.selectButton, styles.selectButtonLoading]}>
        <Text style={[styles.selectButtonText, { color: COLORS.textSecondary }]}>
          {t('common.loading')}
        </Text>
      </View>
    </View>
  );
}
