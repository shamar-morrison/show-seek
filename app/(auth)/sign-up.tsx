import { legal } from '@/app/(auth)/legal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { configureGoogleAuth, signInWithGoogle } from '@/src/firebase/auth';
import { createUserDocument } from '@/src/firebase/user';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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

export default function SignUp() {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  // Configure Google Auth on mount
  useEffect(() => {
    configureGoogleAuth().catch(console.error);
  }, []);

  const handleGoogleSignUp = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();

      if (result.success) {
        // Create/update user document with Google profile info
        await createUserDocument(result.user);
        // Router will automatically redirect based on auth state
      } else if (!result.cancelled && result.error) {
        Alert.alert(t('auth.signUpFailed'), result.error);
      }
      // If cancelled, do nothing (user closed the picker)
    } catch (error: any) {
      Alert.alert(t('common.error'), t('errors.generic'));
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
              <Text style={styles.title}>{t('auth.createAccount')}</Text>
              <Text style={styles.subtitle}>{t('auth.signUpToGetStarted')}</Text>
            </View>

            <View style={styles.form}>
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignUp}
                disabled={loading}
                activeOpacity={ACTIVE_OPACITY}
              >
                {loading ? (
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

              <View style={styles.footer}>
                <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')} </Text>
                <Link href="/(auth)/sign-in" asChild>
                  <TouchableOpacity activeOpacity={ACTIVE_OPACITY}>
                    <Text style={styles.link}>{t('auth.signIn')}</Text>
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
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  googleButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  infoText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
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
