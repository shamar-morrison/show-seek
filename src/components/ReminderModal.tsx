import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ReminderTiming } from '@/src/types/reminder';
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

interface ReminderModalProps {
  visible: boolean;
  onClose: () => void;
  movieId: number;
  movieTitle: string;
  releaseDate: string | null;
  currentTiming?: ReminderTiming;
  hasReminder?: boolean;
  onSetReminder: (timing: ReminderTiming) => Promise<void>;
  onCancelReminder: () => Promise<void>;
  onShowToast?: (message: string) => void;
}

const TIMING_OPTIONS: { value: ReminderTiming; label: string; description: string }[] = [
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

export default function ReminderModal({
  visible,
  onClose,
  movieId,
  movieTitle,
  releaseDate,
  currentTiming,
  hasReminder = false,
  onSetReminder,
  onCancelReminder,
  onShowToast,
}: ReminderModalProps) {
  const [selectedTiming, setSelectedTiming] = useState<ReminderTiming>(
    currentTiming || 'on_release_day'
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleSetReminder = async () => {
    try {
      setIsLoading(true);
      await onSetReminder(selectedTiming);
      onShowToast?.('Reminder set successfully!');
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : 'Failed to set reminder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReminder = async () => {
    try {
      setIsLoading(true);
      await onCancelReminder();
      onShowToast?.('Reminder cancelled');
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : 'Failed to cancel reminder');
    } finally {
      setIsLoading(false);
    }
  };

  const formatReleaseDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Set Reminder</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Movie Title */}
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movieTitle}
            </Text>

            {/* Release Date Display */}
            {releaseDate ? (
              <View style={styles.releaseDateContainer}>
                <Calendar size={16} color={COLORS.textSecondary} />
                <Text style={styles.releaseDate}>Releases {formatReleaseDate(releaseDate)}</Text>
              </View>
            ) : (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  ⚠️ Release date not available for this movie
                </Text>
              </View>
            )}

            {/* Timing Options */}
            {releaseDate && (
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
            )}

            {/* Action Buttons */}
            {releaseDate && (
              <View style={styles.actions}>
                {hasReminder ? (
                  <>
                    <TouchableOpacity
                      style={[styles.button, styles.updateButton]}
                      onPress={handleSetReminder}
                      disabled={isLoading || selectedTiming === currentTiming}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <Text style={styles.buttonText}>Update Reminder</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleCancelReminder}
                      disabled={isLoading}
                    >
                      <Text style={[styles.buttonText, styles.cancelButtonText]}>
                        Cancel Reminder
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.button, styles.setButton]}
                    onPress={handleSetReminder}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={styles.buttonText}>Set Reminder</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
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
  warningContainer: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.l,
  },
  warningText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.warning,
    textAlign: 'center',
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
  actions: {
    gap: SPACING.m,
  },
  button: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  setButton: {
    backgroundColor: COLORS.primary,
  },
  updateButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  cancelButtonText: {
    color: COLORS.error,
  },
});
