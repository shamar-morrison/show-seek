import { PremiumWidgetGate } from '@/src/components/widgets/PremiumWidgetGate';
import { WidgetCard } from '@/src/components/widgets/WidgetCard';
import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { useRouter } from 'expo-router';
import { Info, Plus } from 'lucide-react-native';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WidgetsScreen() {
  const { user } = useAuth();
  const { widgets, removeWidget, refreshAllWidgets } = useWidgets(user?.uid);
  const router = useRouter();

  const handleAddWidget = () => {
    router.push('/(tabs)/settings/widgets/configure/new');
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <PremiumWidgetGate>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Home Screen Widgets</Text>
          <TouchableOpacity onPress={refreshAllWidgets} style={styles.refreshButton}>
            <Text style={styles.refreshText}>Refresh All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.infoCard}>
            <Info size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>
              Configured widgets here will update on your Android home screen. After configuring,
              long-press on your home screen to add the "ShowSeek" widget.
            </Text>
          </View>

          {widgets.length > 0 ? (
            widgets.map((widget) => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                onEdit={() => router.push(`/(tabs)/settings/widgets/configure/${widget.id}`)}
                onDelete={() => handleDelete(widget.id)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No widgets configured yet.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.addButton} onPress={handleAddWidget}>
            <Plus size={20} color="#000" />
            <Text style={styles.addButtonText}>Add New Widget</Text>
          </TouchableOpacity>
        </ScrollView>
      </PremiumWidgetGate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  refreshButton: {
    padding: 8,
  },
  refreshText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 20,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  addButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
