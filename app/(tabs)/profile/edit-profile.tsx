import { UserAvatar } from '@/src/components/ui/UserAvatar';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import {
  DISPLAY_NAME_MAX_LENGTH,
  ProfilePhotoChange,
  updateUserProfile,
} from '@/src/services/ProfileService';
import { screenStyles } from '@/src/styles/screenStyles';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accentColor } = useAccentColor();
  const { user, isGuest, refreshProfile } = useAuth();

  const [name, setName] = useState(user?.displayName ?? '');
  const [photo, setPhoto] = useState<ProfilePhotoChange>({ type: 'keep' });
  const [isSaving, setIsSaving] = useState(false);

  if (!user || isGuest) {
    return <Redirect href="/(tabs)/profile/account" />;
  }

  const trimmedName = name.trim();
  const previewPhoto =
    photo.type === 'replace' ? photo.uri : photo.type === 'remove' ? null : user.photoURL;
  const hasChanges = photo.type !== 'keep' || trimmedName !== (user.displayName?.trim() ?? '');
  const canSave = !!trimmedName && hasChanges && !isSaving;

  const handlePickPhoto = async () => {
    try {
      // Opens the system picker, which needs no photo or camera permissions.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        // Android only: iOS uses the system's crop screen, which is always a square.
        shape: 'oval',
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setPhoto({ type: 'replace', uri: result.assets[0].uri });
      }
    } catch (error) {
      console.error('[EditProfile] Failed to pick a photo:', error);
      Alert.alert(t('common.error'), t('profile.photoPickFailed'));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await updateUserProfile(user, { displayName: trimmedName, photo });
      await refreshProfile();
      router.back();
    } catch (error) {
      console.error('[EditProfile] Failed to save the profile:', error);
      Alert.alert(t('common.error'), t('profile.profileUpdateFailed'));
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={handlePickPhoto}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={previewPhoto ? t('profile.changePhoto') : t('profile.addPhoto')}
          testID="edit-profile-avatar"
        >
          <UserAvatar
            photoURL={previewPhoto}
            displayName={trimmedName}
            email={user.email}
            size={120}
          />
        </Pressable>

        <View style={styles.photoActions}>
          <TouchableOpacity
            onPress={handlePickPhoto}
            disabled={isSaving}
            activeOpacity={ACTIVE_OPACITY}
            testID="edit-profile-change-photo"
          >
            <Text style={[styles.photoAction, { color: accentColor }]}>
              {previewPhoto ? t('profile.changePhoto') : t('profile.addPhoto')}
            </Text>
          </TouchableOpacity>
          {!!previewPhoto && (
            <TouchableOpacity
              onPress={() => setPhoto({ type: 'remove' })}
              disabled={isSaving}
              activeOpacity={ACTIVE_OPACITY}
              testID="edit-profile-remove-photo"
            >
              <Text style={[styles.photoAction, styles.removePhoto]}>
                {t('profile.removePhoto')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.displayNameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            editable={!isSaving}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            placeholderTextColor={COLORS.textSecondary}
            selectionColor={accentColor}
            keyboardAppearance="dark"
            accessibilityLabel={t('profile.displayNameLabel')}
            testID="edit-profile-name"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: accentColor }, !canSave && styles.disabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={ACTIVE_OPACITY}
          accessibilityRole="button"
          testID="edit-profile-save"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.saveText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  photoActions: {
    flexDirection: 'row',
    gap: SPACING.l,
    marginTop: SPACING.m,
  },
  photoAction: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
  removePhoto: {
    color: COLORS.textSecondary,
  },
  field: {
    alignSelf: 'stretch',
    marginTop: SPACING.xl,
    gap: SPACING.s,
  },
  label: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text,
  },
  saveButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.l,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  saveText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  disabled: {
    opacity: 0.5,
  },
});
