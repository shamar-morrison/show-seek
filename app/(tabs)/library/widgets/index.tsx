import { PremiumWidgetGate } from '@/src/components/widgets/PremiumWidgetGate';
import { WidgetCard } from '@/src/components/widgets/WidgetCard';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { useRouter } from 'expo-router';
import { Info, Plus } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function WidgetsScreen() {
  const { user } = useAuth();
  const { widgets, removeWidget } = useWidgets(user?.uid);
  const router = useRouter();

  const handleAddWidget = () => {
    router.push('/(tabs)/library/widgets/configure/new');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Widget',
      'Are you sure you want to remove this widget configuration? This will stop updates for this widget.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
          <Text style={styles.infoText}>
            Configure widgets here, then long-press on your Android home screen to add the
            "ShowSeek" widget.
          </Text>
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
            <Text style={styles.emptyText}>No widgets configured yet.</Text>
          </View>
        )}

        <Pressable style={styles.addButton} onPress={handleAddWidget}>
          <Plus size={20} color={COLORS.white} />
          <Text style={styles.addButtonText}>Add New Widget</Text>
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
