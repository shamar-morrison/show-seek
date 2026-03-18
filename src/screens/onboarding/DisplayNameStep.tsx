import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface DisplayNameStepProps {
  displayName: string;
  onChangeDisplayName: (name: string) => void;
}

export default function DisplayNameStep({
  displayName,
  onChangeDisplayName,
}: DisplayNameStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user } = useAuth();

  // The placeholder shows the existing Auth display name or email prefix
  const placeholder =
    user?.displayName || user?.email?.split('@')[0] || t('personalOnboarding.displayNamePlaceholder');

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.title}>{t('personalOnboarding.displayNameTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.displayNameSubtitle')}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(250)} style={styles.inputContainer}>
        <TextInput
          style={[styles.input, { borderColor: displayName ? accentColor : COLORS.surfaceLight }]}
          value={displayName}
          onChangeText={onChangeDisplayName}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={50}
          autoFocus
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  inputContainer: {
    marginTop: SPACING.m,
  },
  input: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    fontWeight: '600',
  },
});
