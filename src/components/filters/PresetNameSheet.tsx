import { AppIcon } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import {
  MAX_PRESET_NAME_LENGTH,
  normalizePresetName,
  type PresetNameError,
} from '@/src/utils/filterPresets';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface PresetNameSheetRef {
  /** Opens to save new filters (empty name) or to rename (current name filled in). */
  present: (options: {
    mode: 'create' | 'rename';
    name?: string;
    summary: string;
  }) => Promise<void>;
  dismiss: () => Promise<void>;
}

interface PresetNameSheetProps {
  /** Why a name can't be used, or null when it can. */
  validateName: (name: string) => PresetNameError | null;
  /** Gets the cleaned-up name once it passes validation. */
  onSubmit: (name: string) => void;
  onDidDismiss?: () => void;
}

/** Names saved filters, or renames them. Shows what's being saved as a one-line summary. */
const PresetNameSheet = forwardRef<PresetNameSheetRef, PresetNameSheetProps>(
  ({ validateName, onSubmit, onDidDismiss }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const { width } = useWindowDimensions();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const [mode, setMode] = useState<'create' | 'rename'>('create');
    const [summary, setSummary] = useState('');
    const [name, setName] = useState('');
    const [originalName, setOriginalName] = useState('');
    const [error, setError] = useState<PresetNameError | null>(null);

    useImperativeHandle(ref, () => ({
      present: async (options) => {
        setMode(options.mode);
        setSummary(options.summary);
        setName(options.name ?? '');
        setOriginalName(options.name ?? '');
        setError(null);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const unchanged = mode === 'rename' && normalizePresetName(name) === originalName;
    const canSave = normalizePresetName(name).length > 0 && !unchanged;

    const handleSave = () => {
      if (!canSave) return;
      const problem = validateName(name);
      if (problem) {
        setError(problem);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubmit(normalizePresetName(name));
      void sheetRef.current?.dismiss();
    };

    const errorText =
      error === 'empty'
        ? t('filterPresets.errors.empty')
        : error === 'tooLong'
          ? t('filterPresets.errors.tooLong', { count: MAX_PRESET_NAME_LENGTH })
          : error === 'duplicate'
            ? t('filterPresets.errors.duplicate')
            : null;

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
        onDidDismiss={onDidDismiss}
      >
        <GestureHandlerRootView style={[modalSheetStyles.content, styles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>
              {mode === 'rename' ? t('filterPresets.renameTitle') : t('filterPresets.saveTitle')}
            </Text>
            <Pressable
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="preset-name-close"
            >
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          {summary ? (
            <Text style={styles.summary} numberOfLines={2} testID="preset-name-summary">
              {summary}
            </Text>
          ) : null}

          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder={t('filterPresets.namePlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
            maxLength={MAX_PRESET_NAME_LENGTH + 10}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
            selectionColor={accentColor}
            accessibilityLabel={t('filterPresets.namePlaceholder')}
            testID="preset-name-input"
          />
          {errorText ? (
            <Text style={styles.errorText} testID="preset-name-error">
              {errorText}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityRole="button"
              testID="preset-name-cancel"
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.saveButton,
                { backgroundColor: accentColor },
                !canSave && styles.disabledButton,
              ]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              testID="preset-name-save"
            >
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            </Pressable>
          </View>
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

PresetNameSheet.displayName = 'PresetNameSheet';

export default PresetNameSheet;

const styles = StyleSheet.create({
  content: {
    gap: SPACING.m,
    paddingBottom: SPACING.l,
  },
  summary: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.s,
    marginTop: -SPACING.s,
  },
  input: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    padding: SPACING.m,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.s,
    marginTop: -SPACING.s,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
  saveButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
