import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { auth } from '@/src/firebase/config';
import { createUserDocument } from '@/src/firebase/user';
import { trackLogin } from '@/src/services/analytics';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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

const PROVIDER_LABELS: Record<string, string> = {
  'google.com': 'Google',
  'facebook.com': 'Facebook',
  'github.com': 'GitHub',
  'microsoft.com': 'Microsoft',
  'apple.com': 'Apple',
  'twitter.com': 'X',
  password: 'Email and Password',
};

interface EmailAuthSectionProps {
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

function getProviderLabel(method: string | undefined): string {
  if (!method) {
    return '';
  }

  return PROVIDER_LABELS[method] ?? method.replace(/\.(com|net|org)$/, '');
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

  const isDisabled = disabled || loading;

  useEffect(() => {
    return () => {
      onLoadingChange?.(false);
    };
  }, [onLoadingChange]);

  const updateLoading = (nextLoading: boolean) => {
    setLoading(nextLoading);
    onLoadingChange?.(nextLoading);
  };

  const completeEmailAuth = async (user: Parameters<typeof createUserDocument>[0]) => {
    await createUserDocument(user);
    void trackLogin('email');
  };

  const showExistingAccountMessage = async (normalizedEmail: string, methods?: string[]) => {
    try {
      const signInMethods = methods ?? (await fetchSignInMethodsForEmail(auth, normalizedEmail));
      const providerLabel = getProviderLabel(signInMethods[0]);

      Alert.alert(
        t('auth.emailAlreadyInUseTitle'),
        providerLabel
          ? t('auth.emailAlreadyLinkedWithProvider', { provider: providerLabel })
          : t('auth.emailAlreadyInUseMessage')
      );
    } catch {
      Alert.alert(t('auth.emailAlreadyInUseTitle'), t('auth.emailAlreadyInUseMessage'));
    }
  };

  const handleCreateAccount = async (normalizedEmail: string, enteredPassword: string) => {
    updateLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        enteredPassword
      );
      await completeEmailAuth(userCredential.user);
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        await showExistingAccountMessage(normalizedEmail);
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

      Alert.alert(t('auth.signInFailed'), errorMessage);
    } finally {
      updateLoading(false);
    }
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
      const signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail);

      if (signInMethods.includes('password')) {
        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        await completeEmailAuth(userCredential.user);
        return;
      }

      if (signInMethods.length > 0) {
        await showExistingAccountMessage(normalizedEmail, signInMethods);
        return;
      }

      Alert.alert(
        t('auth.emailCreateAccountTitle'),
        t('auth.emailCreateAccountMessage', { email: normalizedEmail }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('auth.createAccount'),
            onPress: () => {
              void handleCreateAccount(normalizedEmail, password);
            },
          },
        ]
      );
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        await showExistingAccountMessage(normalizedEmail);
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
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          errorMessage = t('auth.signInFailed');
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
