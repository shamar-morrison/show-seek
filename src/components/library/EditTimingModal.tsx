import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Reminder, ReminderTiming } from '@/src/types/reminder';
import { BlurView } from 'expo-blur';
import { Calendar, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface EditTimingModalProps {
  visible: boolean;
  onClose: () => void;
  reminder: Reminder;
  onUpdateTiming: (reminderId: string, timing: ReminderTiming) => Promise<void>;
}

const TIMING_OPTIONS: { value: ReminderTiming; label: string; description: string }[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        label: 'Test in 10 seconds',
        description: 'DEV MODE: Notification in 10 seconds',
      },
      {
        value: '1_day_before',
        label: 'Test in 20 seconds',
        description: 'DEV MODE: Notification in 20 seconds',
      },
      {
        value: '1_week_before',
        label: 'Test in 30 seconds',
        description: 'DEV MODE: Notification in 30 seconds',
      },
    ]
  : [
      {
        value: 'on_release_day',
        label: 'On Release Day',
        description: 'Get notified on the day of release',
      },
      {
        value: '1_day_before',
        label: '1 Day Before',
        description: 'Get notified one day before release',
      },
      {
        value: '1_week_before',
        label: '1 Week Before',
        description: 'Get notified one week before release',
      },
    ];

export default function EditTimingModal({
  visible,
  onClose,
  reminder,
  onUpdateTiming,
}: EditTimingModalProps) {
  const [selectedTiming, setSelectedTiming] = useState<ReminderTiming>(reminder.reminderTiming);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateTiming = async () => {
    try {
      setIsLoading(true);
      await onUpdateTiming(reminder.id, selectedTiming);
      onClose();
    } catch (error) {
      console.error('Failed to update timing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatReleaseDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const isUpdateDisabled = isLoading || selectedTiming === reminder.reminderTiming;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onClose}
        />
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Reminder Timing</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Dev Mode Banner */}
            {__DEV__ && (
              <View style={styles.devBanner}>
                <Text style={styles.devBannerText}>
                  🧪 DEV MODE: Notifications scheduled for 10-30 seconds
                </Text>
              </View>
            )}

            {/* Movie Title */}
            <Text style={styles.movieTitle} numberOfLines={2}>
              {reminder.title}
            </Text>

            {/* Release Date Display */}
            <View style={styles.releaseDateContainer}>
              <Calendar size={16} color={COLORS.textSecondary} />
              <Text style={styles.releaseDate}>
                Releases {formatReleaseDate(reminder.releaseDate)}
              </Text>
            </View>

            {/* Timing Options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notify me:</Text>
              {TIMING_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.timingOption,
                    selectedTiming === option.value && styles.timingOptionSelected,
                  ]}
                  onPress={() => setSelectedTiming(option.value)}
                  disabled={isLoading}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <View style={styles.radioOuter}>
                    {selectedTiming === option.value && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.timingTextContainer}>
                    <Text style={styles.timingLabel}>{option.label}</Text>
                    <Text style={styles.timingDescription}>{option.description}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Update Button */}
            <TouchableOpacity
              style={[styles.button, isUpdateDisabled && styles.buttonDisabled]}
              onPress={handleUpdateTiming}
              disabled={isUpdateDisabled}
              activeOpacity={ACTIVE_OPACITY}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>Update Reminder</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  movieTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    marginBottom: SPACING.m,
    fontWeight: '600',
  },
  releaseDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  releaseDate: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  timingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
    gap: SPACING.m,
  },
  timingOptionSelected: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  timingTextContainer: {
    flex: 1,
  },
  timingLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  timingDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  button: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: COLORS.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  devBanner: {
    backgroundColor: COLORS.warning,
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  devBannerText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.background,
    textAlign: 'center',
    fontWeight: '600',
  },
});
