import { legal } from '@/app/(auth)/legal';
import { AnimatedBackground } from '@/src/components/auth/AnimatedBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { configureGoogleAuth, signInWithGoogle } from '@/src/firebase/auth';
import { createUserDocument } from '@/src/firebase/user';
import { screenStyles } from '@/src/styles/screenStyles';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignIn() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
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
    } catch {
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setGoogleLoading(false);
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
                <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
                <Text style={styles.subtitle}>{t('auth.signInToContinue')}</Text>
              </View>

              <View style={styles.form}>
                {/* Google Sign-In Button */}
                <TouchableOpacity
                  style={styles.googleButton}
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading}
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

                <View style={styles.legacyLinkContainer}>
                  <Link href="/(auth)/email-sign-in" asChild>
                    <TouchableOpacity activeOpacity={ACTIVE_OPACITY}>
                      <Text style={[styles.link, { color: accentColor }]}>
                        {t('auth.continueWithEmailPassword')}
                      </Text>
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
    gap: SPACING.m,
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
  legacyLinkContainer: {
    alignItems: 'center',
  },
  link: {
    fontWeight: '600',
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
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
