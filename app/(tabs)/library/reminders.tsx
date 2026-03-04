import EditTimingModal from '@/src/components/library/EditTimingModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { ReminderCard } from '@/src/components/library/ReminderCard';
import { CategoryTab, CategoryTabs } from '@/src/components/ui/CategoryTabs';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { ACTIVE_OPACITY, COLORS, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useCancelReminder, useReminders, useUpdateReminder } from '@/src/hooks/useReminders';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { Reminder, ReminderTiming } from '@/src/types/reminder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation } from 'expo-router';
import { Bell, List, Rows3 } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ViewMode = 'flat' | 'grouped';
type ReminderGroupKey = 'today' | 'thisWeek' | 'thisMonth' | 'later';
type ReminderGroups = Record<ReminderGroupKey, Reminder[]>;
type ReminderTabKey = 'all' | ReminderGroupKey;

const STORAGE_KEY = 'remindersViewMode';
const REMINDER_LIST_DRAW_DISTANCE = 350;

export default function RemindersScreen() {
  const navigation = useNavigation();
  const { data: reminders, isLoading } = useReminders();
  const { t, i18n } = useTranslation();

  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [activeReminderTab, setActiveReminderTab] = useState<ReminderTabKey>('all');
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
          hitSlop={HIT_SLOP.m}
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

  const groupedReminders = useMemo<ReminderGroups>(() => {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const monthEnd = new Date(now);
    monthEnd.setDate(monthEnd.getDate() + 30);

    const groups: ReminderGroups = {
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

    return groups;
  }, [sortedReminders]);

  const reminderTabs = useMemo<CategoryTab[]>(
    () => [
      { key: 'all', label: t('common.all', { defaultValue: 'All' }) },
      { key: 'today', label: t('common.today') },
      { key: 'thisWeek', label: t('common.thisWeek') },
      { key: 'thisMonth', label: t('common.thisMonth') },
      { key: 'later', label: t('common.later') },
    ],
    [t, i18n.language]
  );

  const groupedModeReminders = useMemo(() => {
    if (activeReminderTab === 'all') return sortedReminders;
    return groupedReminders[activeReminderTab];
  }, [activeReminderTab, groupedReminders, sortedReminders]);

  const isTabMode = viewMode === 'grouped';
  const listData = isTabMode ? groupedModeReminders : sortedReminders;

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
        Alert.alert(t('common.success'), t('reminder.timingUpdated'));
      } catch (error) {
        Alert.alert(
          t('common.error'),
          error instanceof Error ? error.message : t('reminder.failedToUpdateTiming')
        );
        throw error; // Re-throw to keep modal open
      }
    },
    [updateMutation, t]
  );

  const handleCancelReminder = useCallback(
    async (reminderId: string) => {
      Alert.alert(t('reminder.removeReminder'), t('reminder.confirmCancel'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminder.removeReminder'),
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingId(reminderId);
              await cancelMutation.mutateAsync(reminderId);
            } catch (error) {
              Alert.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('reminder.failedToCancel')
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]);
    },
    [cancelMutation, t]
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
        t={t}
      />
    ),
    [handleEditTiming, handleCancelReminder, cancellingId, t]
  );

  const keyExtractor = useCallback((item: Reminder) => item.id, []);

  // Loading state
  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  // Empty state
  if (!sortedReminders || sortedReminders.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Bell}
          title={t('library.emptyReminders')}
          description={t('library.emptyRemindersHint')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={libraryListStyles.divider} />
      <View style={styles.listContainer}>
        {isTabMode && (
          <CategoryTabs
            tabs={reminderTabs}
            activeKey={activeReminderTab}
            onChange={(key) => setActiveReminderTab(key as ReminderTabKey)}
            testID="reminders-category-tabs"
          />
        )}
        <FlashList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={libraryListStyles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          drawDistance={REMINDER_LIST_DRAW_DISTANCE}
        />
      </View>

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
  separator: {
    height: SPACING.m,
  },
  listContainer: {
    flex: 1,
  },
});
