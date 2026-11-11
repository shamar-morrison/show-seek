import { AppIcon } from '@/src/components/ui/AppIcon';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleProp, StyleSheet, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** An always-visible search box for filtering a list on the screen, with a clear button. */
export function SearchField({ value, onChangeText, placeholder, style, testID }: SearchFieldProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  return (
    <View style={[styles.container, style]}>
      <AppIcon icon={Search01Icon} size={18} color={COLORS.textSecondary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textSecondary}
        selectionColor={accentColor}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        keyboardAppearance="dark"
        accessibilityLabel={placeholder}
        testID={testID}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          activeOpacity={ACTIVE_OPACITY}
          hitSlop={SPACING.s}
          accessibilityRole="button"
          accessibilityLabel={t('common.clear')}
          testID={testID ? `${testID}-clear` : undefined}
        >
          <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.s,
    paddingHorizontal: SPACING.m,
  },
  input: {
    color: COLORS.text,
    flex: 1,
    fontSize: FONT_SIZE.m,
    paddingVertical: SPACING.m,
  },
});
