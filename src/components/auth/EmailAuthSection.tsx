import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { auth } from '@/src/firebase/config';
import { createUserDocument } from '@/src/firebase/user';
import { trackLogin } from '@/src/services/analytics';
import { persistPersonalOnboardingCache } from '@/src/utils/personalOnboardingCache';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface EmailAuthSectionProps {
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

export default function EmailAuthSection({
  disabled = false,
  onLoadingChange,
}: EmailAuthSectionProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const latestOnLoadingChangeRef = useRef(onLoadingChange);

  const isDisabled = disabled || loading;

  useEffect(() => {
    latestOnLoadingChangeRef.current = onLoadingChange;
  }, [onLoadingChange]);

  useEffect(() => {
    return () => {
      latestOnLoadingChangeRef.current?.(false);
    };
  }, []);

  const updateLoading = (nextLoading: boolean) => {
    setLoading(nextLoading);
    onLoadingChange?.(nextLoading);
  };

  const completeEmailAuth = async (user: Parameters<typeof createUserDocument>[0]) => {
    await createUserDocument(user);
    void trackLogin('email');
  };

  const seedNewAccountPersonalOnboarding = async (
    user: Parameters<typeof createUserDocument>[0]
  ) => {
    try {
      await persistPersonalOnboardingCache(user.uid, false);
    } catch (error) {
      console.warn('Failed to seed personal onboarding cache:', error);
    }
  };

  const showExistingAccountMessage = () => {
    Alert.alert(t('auth.emailAlreadyInUseTitle'), t('auth.emailAlreadyInUseMessage'));
  };

  const showInvalidCredentialsMessage = () => {
    Alert.alert(t('auth.signInFailed'), t('auth.invalidCredentials'));
  };

  const handleCreateAccount = async (normalizedEmail: string, enteredPassword: string) => {
    updateLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        enteredPassword
      );
      await seedNewAccountPersonalOnboarding(userCredential.user);
      await completeEmailAuth(userCredential.user);
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        showExistingAccountMessage();
        return;
      }

      let errorMessage = t('errors.generic');

      switch (error?.code) {
        case 'auth/invalid-email':
          errorMessage = t('auth.invalidEmail');
          break;
        case 'auth/weak-password':
          errorMessage = t('auth.passwordTooShort');
          break;
        case 'auth/too-many-requests':
          errorMessage = t('auth.tooManyAttempts');
          break;
        case 'auth/network-request-failed':
          errorMessage = t('errors.networkError');
          break;
        default:
          errorMessage = t('auth.signInFailed');
      }

      Alert.alert(t('auth.signUpFailed'), errorMessage);
    } finally {
      updateLoading(false);
    }
  };

  const promptCreateAccount = (normalizedEmail: string, enteredPassword: string) => {
    Alert.alert(t('auth.emailCreateAccountTitle'), t('auth.emailCreateAccountMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('auth.createAccount'),
        onPress: () => {
          void handleCreateAccount(normalizedEmail, enteredPassword);
        },
      },
    ]);
  };

  const handleEmailContinue = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      Alert.alert(t('common.error'), t('auth.emailRequired'));
      return;
    }

    if (!password) {
      Alert.alert(t('common.error'), t('auth.passwordRequired'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordTooShort'));
      return;
    }

    updateLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await completeEmailAuth(userCredential.user);
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-credential') {
        promptCreateAccount(normalizedEmail, password);
        return;
      }

      if (error?.code === 'auth/wrong-password') {
        showInvalidCredentialsMessage();
        return;
      }

      let errorMessage = t('errors.generic');

      switch (error?.code) {
        case 'auth/invalid-email':
          errorMessage = t('auth.invalidEmail');
          break;
        case 'auth/user-disabled':
          errorMessage = t('errors.forbidden');
          break;
        case 'auth/too-many-requests':
          errorMessage = t('auth.tooManyAttempts');
          break;
        case 'auth/network-request-failed':
          errorMessage = t('errors.networkError');
          break;
        default:
          errorMessage = t('auth.signInFailed');
      }

      Alert.alert(t('auth.signInFailed'), errorMessage);
    } finally {
      updateLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.inputWithIcon, isDisabled && styles.disabledField]}>
        <Mail size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.inputField}
          placeholder={t('auth.email')}
          placeholderTextColor={COLORS.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!isDisabled}
          returnKeyType="next"
        />
      </View>

      <View style={[styles.inputWithIcon, isDisabled && styles.disabledField]}>
        <Lock size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.inputField}
          placeholder={t('auth.password')}
          placeholderTextColor={COLORS.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          editable={!isDisabled}
          returnKeyType="done"
          onSubmitEditing={() => {
            void handleEmailContinue();
          }}
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowPassword((current) => !current)}
          disabled={isDisabled}
          activeOpacity={ACTIVE_OPACITY}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          {showPassword ? (
            <EyeOff size={20} color={COLORS.textSecondary} />
          ) : (
            <Eye size={20} color={COLORS.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: accentColor }]}
        onPress={() => {
          void handleEmailContinue();
        }}
        disabled={isDisabled}
        activeOpacity={ACTIVE_OPACITY}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.buttonText}>{t('auth.continueWithEmailPassword')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.l,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
  },
  disabledField: {
    opacity: 0.7,
  },
  inputIcon: {
    marginRight: SPACING.s,
  },
  inputField: {
    flex: 1,
    paddingVertical: SPACING.m,
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
  },
  eyeIcon: {
    padding: SPACING.s,
  },
  button: {
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
});
