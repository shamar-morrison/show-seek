import { legal } from '@/app/(auth)/legal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { configureGoogleAuth, signInWithGoogle } from '@/src/firebase/auth';
import { auth } from '@/src/firebase/config';
import { createUserDocument } from '@/src/firebase/user';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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

export default function SignIn() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Configure Google Auth on mount
  useEffect(() => {
    configureGoogleAuth().catch(console.error);
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();

      if (result.success) {
        // Create/update user document with Google profile info
        await createUserDocument(result.user);
        // Router will automatically redirect based on auth state
      } else if (!result.cancelled && result.error) {
        Alert.alert(t('auth.signInFailed'), result.error);
      }
      // If cancelled, do nothing (user closed the picker)
    } catch (error: any) {
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.emailRequired'));
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
            errorMessage = t('errors.timeout');
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

  const handleGuestSignIn = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      let errorMessage = t('auth.signInFailed');

      if (error.code) {
        switch (error.code) {
          case 'auth/operation-not-allowed':
            errorMessage = t('errors.forbidden');
            break;
          case 'auth/network-request-failed':
            errorMessage = t('errors.networkError');
            break;
        }
      }

      Alert.alert(t('auth.signInFailed'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(229, 9, 20, 0.1)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <RNImage source={require('@/assets/images/icon.png')} style={styles.logo} />
              </View>
              <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
              <Text style={styles.subtitle}>{t('auth.signInToContinue')}</Text>
            </View>

            <View style={styles.form}>
              {/* Google Sign-In Button */}
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                disabled={googleLoading || loading}
                activeOpacity={ACTIVE_OPACITY}
              >
                {googleLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Image
                      source={require('@/assets/images/google-icon.png')}
                      style={styles.googleIcon}
                    />
                    <Text style={styles.googleButtonText}>{t('auth.google')}</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Separator */}
              <View style={styles.separator}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>{t('auth.orContinueWith').toLowerCase()}</Text>
                <View style={styles.separatorLine} />
              </View>

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
                style={styles.button}
                onPress={handleSignIn}
                disabled={loading || googleLoading}
                activeOpacity={ACTIVE_OPACITY}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
                )}
              </TouchableOpacity>

              {!user && (
                <TouchableOpacity
                  style={[styles.button, styles.guestButton]}
                  onPress={handleGuestSignIn}
                  disabled={loading || googleLoading}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Text style={styles.guestButtonText}>{t('auth.continueAsGuest')}</Text>
                </TouchableOpacity>
              )}

              <View style={styles.footer}>
                <Text style={styles.footerText}>{t('auth.dontHaveAccount')} </Text>
                <Link href="/(auth)/sign-up" asChild>
                  <TouchableOpacity activeOpacity={ACTIVE_OPACITY}>
                    <Text style={styles.link}>{t('auth.signUp')}</Text>
                  </TouchableOpacity>
                </Link>
              </View>

              <Text style={styles.termsText}>
                {t('auth.bySigningIn')}{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL(legal.tos)}>
                  {t('settings.terms')}
                </Text>{' '}
                &amp;{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL(legal.privacy)}>
                  {t('settings.privacy')}
                </Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
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
  appName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.l,
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
  inputContainer: {
    gap: SPACING.s,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
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
    backgroundColor: COLORS.primary,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    marginTop: SPACING.m,
  },
  guestButton: {
    backgroundColor: COLORS.surfaceLight,
    marginTop: 0,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.s,
  },
  googleIcon: {
    width: 16,
    height: 16,
    backgroundColor: COLORS.white,
    borderRadius: 2,
  },
  googleButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.s,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  separatorText: {
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.m,
    fontSize: FONT_SIZE.s,
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  guestButtonText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.m,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  link: {
    color: COLORS.primary,
    fontWeight: 'bold',
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
    color: COLORS.primary,
    fontWeight: '600',
  },
});
