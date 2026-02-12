/**
 * Deprecated legacy email/password sign-in screen.
 * Keep this for existing accounts while Google remains the primary auth entry.
 */

import { legal } from '@/app/(auth)/legal';
import { AnimatedBackground } from '@/src/components/auth/AnimatedBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { auth } from '@/src/firebase/config';
import { screenStyles } from '@/src/styles/screenStyles';
import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EmailSignIn() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email) {
      Alert.alert(t('common.error'), t('auth.emailRequired'));
      return;
    }
    if (!password) {
      Alert.alert(t('common.error'), t('auth.passwordRequired'));
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Router will automatically redirect in _layout.tsx based on auth state
    } catch (error: any) {
      let errorMessage = t('errors.generic');

      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-credential':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            errorMessage = t('auth.signInFailed');
            break;
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
      }

      Alert.alert(t('auth.signInFailed'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={screenStyles.container}>
      <AnimatedBackground />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.glassCard}>
              <View style={styles.header}>
                <View style={styles.logoContainer}>
                  <RNImage source={require('@/assets/images/icon.png')} style={styles.logo} />
                </View>
                <Text style={styles.title}>{t('auth.signIn')}</Text>
                <Text style={styles.subtitle}>{t('auth.legacyEmailSignIn')}</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputWithIcon}>
                  <Mail size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputField}
                    placeholder={t('auth.email')}
                    placeholderTextColor={COLORS.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputWithIcon}>
                  <Lock size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputField}
                    placeholder={t('auth.password')}
                    placeholderTextColor={COLORS.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
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
                  onPress={handleSignIn}
                  disabled={loading}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.footer}>
                  <Link href="/(auth)/sign-in" asChild>
                    <TouchableOpacity activeOpacity={ACTIVE_OPACITY}>
                      <Text style={[styles.link, { color: accentColor }]}>{t('common.back')}</Text>
                    </TouchableOpacity>
                  </Link>
                </View>

                <Text style={styles.termsText}>
                  {t('auth.bySigningIn')}{' '}
                  <Text
                    style={[styles.termsLink, { color: accentColor }]}
                    onPress={() => Linking.openURL(legal.tos)}
                  >
                    {t('settings.terms')}
                  </Text>{' '}
                  {t('common.and')}{' '}
                  <Text
                    style={[styles.termsLink, { color: accentColor }]}
                    onPress={() => Linking.openURL(legal.privacy)}
                  >
                    {t('settings.privacy')}
                  </Text>
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.l,
  },
  glassCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: SPACING.s,
  },
  logo: {
    width: 130,
    height: 130,
    marginLeft: -25,
    marginTop: -25,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: SPACING.l,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
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
  footer: {
    alignItems: 'center',
  },
  link: {
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
  termsText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.s,
    lineHeight: 16,
  },
  termsLink: {
    fontWeight: '600',
  },
});
