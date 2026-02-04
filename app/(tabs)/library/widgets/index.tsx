import { PremiumWidgetGate } from '@/src/components/widgets/PremiumWidgetGate';
import { WidgetCard } from '@/src/components/widgets/WidgetCard';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Info, Plus, RefreshCw } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function WidgetsScreen() {
  const { user } = useAuth();
  const { widgets, removeWidget, reloadWidgets } = useWidgets(user?.uid);
  const router = useRouter();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      reloadWidgets();
    }, [reloadWidgets])
  );

  const handleAddWidget = () => {
    router.push('/(tabs)/library/widgets/configure/new');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      t('widgets.deleteWidgetTitle'),
      t('widgets.deleteWidgetMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => removeWidget(id),
        },
      ]
    );
  };

  return (
    <PremiumWidgetGate>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Info size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>{t('widgets.info')}</Text>
        </View>

        {widgets.length > 0 ? (
          widgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              onEdit={() => router.push(`/(tabs)/library/widgets/configure/${widget.id}` as any)}
              onDelete={() => handleDelete(widget.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('widgets.empty')}</Text>
          </View>
        )}

        <Stack.Screen
          options={{
            headerRight: () => (
              <Pressable
                onPress={async () => {
                  await reloadWidgets();
                  Alert.alert(t('common.success'), t('widgets.refreshed'));
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}
              >
                <RefreshCw size={20} color={COLORS.text} />
              </Pressable>
            ),
          }}
        />

        <Pressable style={styles.addButton} onPress={handleAddWidget}>
          <Plus size={20} color={COLORS.white} />
          <Text style={styles.addButtonText}>{t('widgets.addNew')}</Text>
        </Pressable>
      </ScrollView>
    </PremiumWidgetGate>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.l,
    flexGrow: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.l,
    gap: SPACING.m,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
  },
  emptyState: {
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.s,
    marginTop: SPACING.m,
  },
  addButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
});
