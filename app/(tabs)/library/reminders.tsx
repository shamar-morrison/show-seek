import EditTimingModal from '@/src/components/library/EditTimingModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { ReminderCard } from '@/src/components/library/ReminderCard';
import { ACTIVE_OPACITY, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCancelReminder, useReminders, useUpdateReminder } from '@/src/hooks/useReminders';
import { Reminder, ReminderTiming } from '@/src/types/reminder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation } from 'expo-router';
import { Bell, List, Rows3 } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ViewMode = 'flat' | 'grouped';
type ReminderSection = {
  title: string;
  data: Reminder[];
};

const STORAGE_KEY = 'remindersViewMode';

export default function RemindersScreen() {
  const navigation = useNavigation();
  const { data: reminders, isLoading } = useReminders();

  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const updateMutation = useUpdateReminder();
  const cancelMutation = useCancelReminder();

  // Load view mode preference from AsyncStorage
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'flat' || saved === 'grouped') {
          setViewMode(saved);
        }
      } catch (error) {
        console.error('Failed to load view mode preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
  }, []);

  // Toggle view mode and save to AsyncStorage
  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode: ViewMode = viewMode === 'flat' ? 'grouped' : 'flat';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode]);

  // Configure header with toggle button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={toggleViewMode}
          style={{ marginRight: SPACING.s }}
          activeOpacity={ACTIVE_OPACITY}
        >
          {viewMode === 'flat' ? (
            <Rows3 size={24} color={COLORS.text} />
          ) : (
            <List size={24} color={COLORS.text} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, viewMode, toggleViewMode]);

  // Sort reminders by notification scheduled time (earliest first)
  const sortedReminders = useMemo(() => {
    if (!reminders) return [];
    return [...reminders].sort((a, b) => a.notificationScheduledFor - b.notificationScheduledFor);
  }, [reminders]);

  // Group reminders by release date proximity
  const groupedReminders = useMemo(() => {
    if (!sortedReminders || viewMode === 'flat') return null;

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const monthEnd = new Date(now);
    monthEnd.setDate(monthEnd.getDate() + 30);

    const groups = {
      today: [] as Reminder[],
      thisWeek: [] as Reminder[],
      thisMonth: [] as Reminder[],
      later: [] as Reminder[],
    };

    sortedReminders.forEach((reminder) => {
      const releaseDate = new Date(reminder.releaseDate);
      if (releaseDate <= todayEnd) {
        groups.today.push(reminder);
      } else if (releaseDate <= weekEnd) {
        groups.thisWeek.push(reminder);
      } else if (releaseDate <= monthEnd) {
        groups.thisMonth.push(reminder);
      } else {
        groups.later.push(reminder);
      }
    });

    const sections: ReminderSection[] = [];
    if (groups.today.length) sections.push({ title: 'TODAY', data: groups.today });
    if (groups.thisWeek.length) sections.push({ title: 'THIS WEEK', data: groups.thisWeek });
    if (groups.thisMonth.length) sections.push({ title: 'THIS MONTH', data: groups.thisMonth });
    if (groups.later.length) sections.push({ title: 'LATER', data: groups.later });

    return sections;
  }, [sortedReminders, viewMode]);

  // Action handlers
  const handleEditTiming = useCallback((reminder: Reminder) => {
    setSelectedReminder(reminder);
    setEditModalVisible(true);
  }, []);

  const handleUpdateTiming = useCallback(
    async (reminderId: string, timing: ReminderTiming) => {
      try {
        await updateMutation.mutateAsync({ reminderId, timing });
        setEditModalVisible(false);
        Alert.alert('Success', 'Reminder timing updated successfully');
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update reminder');
        throw error; // Re-throw to keep modal open
      }
    },
    [updateMutation]
  );

  const handleCancelReminder = useCallback(
    async (reminderId: string) => {
      Alert.alert('Cancel Reminder', 'Are you sure you want to cancel this reminder?', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Reminder',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingId(reminderId);
              await cancelMutation.mutateAsync(reminderId);
            } catch (error) {
              Alert.alert(
                'Error',
                error instanceof Error ? error.message : 'Failed to cancel reminder'
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]);
    },
    [cancelMutation]
  );

  // Render callbacks
  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const renderItem = useCallback(
    ({ item }: { item: Reminder }) => (
      <ReminderCard
        reminder={item}
        onEditTiming={handleEditTiming}
        onCancel={handleCancelReminder}
        isLoading={cancellingId === item.id}
      />
    ),
    [handleEditTiming, handleCancelReminder, cancellingId]
  );

  const keyExtractor = useCallback((item: Reminder) => item.id, []);

  const renderSectionHeader = useCallback(
    ({ section }: { section: ReminderSection }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    []
  );

  const renderSectionSeparator = useCallback(() => <View style={styles.sectionSeparator} />, []);

  // Loading state
  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Empty state
  if (!sortedReminders || sortedReminders.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={Bell}
          title="No Active Reminders"
          description="Set reminders for upcoming releases to get notified."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {viewMode === 'flat' ? (
        <FlashList
          data={sortedReminders}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
        />
      ) : (
        <SectionList
          sections={groupedReminders || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          SectionSeparatorComponent={renderSectionSeparator}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemSeparator}
        />
      )}

      {selectedReminder && (
        <EditTimingModal
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          reminder={selectedReminder}
          onUpdateTiming={handleUpdateTiming}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  separator: {
    height: SPACING.m,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.s,
  },
  sectionSeparator: {
    height: SPACING.l,
  },
});
