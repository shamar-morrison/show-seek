import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useProfileStats } from '@/src/hooks/useProfileStats';
import { profileService } from '@/src/services/ProfileService';
import * as Haptics from 'expo-haptics';
import { Coffee, Film, Heart, LogOut, Trash2, Tv, User } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const KOFI_URL = 'https://ko-fi.com/yourusername'; // TODO: Replace with actual Ko-fi URL

/**
 * Extract initials from display name or email
 */
function getInitials(displayName: string | null, email: string | null): string {
  if (displayName && displayName.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return displayName.trim().substring(0, 2).toUpperCase();
  }

  if (email) {
    return email.substring(0, 2).toUpperCase();
  }

  return 'GU'; // Guest User
}

interface StatCardProps {
  icon: typeof Film;
  label: string;
  count: number;
  isLoading: boolean;
}

function StatCard({ icon: Icon, label, count, isLoading }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Icon size={20} color={COLORS.primary} />
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS.textSecondary} style={styles.statLoader} />
      ) : (
        <Text style={styles.statCount}>{count}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface ActionButtonProps {
  icon: typeof LogOut;
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

function ActionButton({
  icon: Icon,
  label,
  onPress,
  variant = 'default',
  loading,
}: ActionButtonProps) {
  const isDanger = variant === 'danger';

  return (
    <TouchableOpacity
      style={[styles.actionButton, isDanger && styles.actionButtonDanger]}
      onPress={onPress}
      activeOpacity={ACTIVE_OPACITY}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isDanger ? COLORS.error : COLORS.text} />
      ) : (
        <Icon size={20} color={isDanger ? COLORS.error : COLORS.text} />
      )}
      <Text style={[styles.actionButtonText, isDanger && styles.actionButtonTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { stats, isLoading: statsLoading } = useProfileStats();

  const [isDeleting, setIsDeleting] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthLoading, setReauthLoading] = useState(false);

  const isGuest = user?.isAnonymous === true;
  const displayName = user?.displayName || (isGuest ? 'Guest' : 'User');
  const email = user?.email || (isGuest ? 'Not signed in' : 'No email');
  const initials = getInitials(user?.displayName || null, user?.email || null);

  const handleDonate = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const supported = await Linking.canOpenURL(KOFI_URL);
      if (supported) {
        await Linking.openURL(KOFI_URL);
      } else {
        Alert.alert('Error', 'Unable to open the link');
      }
    } catch (_error) {
      Alert.alert('Error', 'Unable to open the link');
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await signOut();
      // Router will handle redirect in _layout.tsx
    } catch (_error) {
      Alert.alert('Error', 'Unable to sign out. Please try again.');
    }
  }, [signOut]);

  const performAccountDeletion = useCallback(async () => {
    setIsDeleting(true);
    try {
      await profileService.deleteAccount();
      // Account deleted successfully, router will handle redirect
    } catch (error: any) {
      if (error.message === 'REQUIRES_REAUTH') {
        setShowReauthModal(true);
      } else {
        Alert.alert('Error', error.message || 'Unable to delete account. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (isGuest) {
      Alert.alert('Guest Account', 'Guest accounts have no data to delete. Sign out to leave.', [
        { text: 'OK' },
      ]);
      return;
    }

    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data including ratings, favorites, lists, and watch history will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: performAccountDeletion,
        },
      ]
    );
  }, [isGuest, performAccountDeletion]);

  const handleReauthAndDelete = useCallback(async () => {
    if (!reauthPassword.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setReauthLoading(true);
    try {
      await profileService.deleteAccountWithReauth(reauthPassword);
      setShowReauthModal(false);
      // Account deleted successfully, router will handle redirect
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Unable to delete account. Please check your password and try again.'
      );
    } finally {
      setReauthLoading(false);
      setReauthPassword('');
    }
  }, [reauthPassword]);

  const cancelReauth = useCallback(() => {
    setShowReauthModal(false);
    setReauthPassword('');
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* User Info Section */}
        <View style={styles.userSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        {/* Stats Section */}
        {!isGuest && (
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>ACTIVITY</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon={Film}
                label="Movies Rated"
                count={stats.movieRatingsCount}
                isLoading={statsLoading}
              />
              <StatCard
                icon={Tv}
                label="TV Rated"
                count={stats.tvRatingsCount}
                isLoading={statsLoading}
              />
              <StatCard
                icon={User}
                label="Fav People"
                count={stats.favoritePersonsCount}
                isLoading={statsLoading}
              />
              <StatCard
                icon={Heart}
                label="Movies Liked"
                count={stats.favoritesMovieCount}
                isLoading={statsLoading}
              />
              <StatCard
                icon={Heart}
                label="TV Liked"
                count={stats.favoritesTvCount}
                isLoading={statsLoading}
              />
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>SETTINGS</Text>
          <View style={styles.actionsList}>
            <ActionButton icon={Coffee} label="Support Development" onPress={handleDonate} />
            <ActionButton icon={LogOut} label="Sign Out" onPress={handleSignOut} />
            {!isGuest && (
              <ActionButton
                icon={Trash2}
                label="Delete Account"
                onPress={handleDeleteAccount}
                variant="danger"
                loading={isDeleting}
              />
            )}
          </View>
        </View>

        {/* Re-auth Modal (inline) */}
        {showReauthModal && (
          <View style={styles.reauthSection}>
            <Text style={styles.sectionTitle}>CONFIRM IDENTITY</Text>
            <Text style={styles.reauthDescription}>
              For security, please enter your password to delete your account.
            </Text>
            <TextInput
              style={styles.reauthInput}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.textSecondary}
              secureTextEntry
              value={reauthPassword}
              onChangeText={setReauthPassword}
              autoFocus
            />
            <View style={styles.reauthButtons}>
              <TouchableOpacity
                style={[styles.reauthButton, styles.reauthCancelButton]}
                onPress={cancelReauth}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.reauthCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reauthButton, styles.reauthConfirmButton]}
                onPress={handleReauthAndDelete}
                disabled={reauthLoading}
                activeOpacity={ACTIVE_OPACITY}
              >
                {reauthLoading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.reauthConfirmText}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: SPACING.xxl,
  },
  header: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  userSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.l,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  avatarText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  displayName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  email: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
  },
  statsSection: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.m,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
  },
  statCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    alignItems: 'center',
    minWidth: 100,
    flex: 1,
  },
  statLoader: {
    marginVertical: SPACING.xs,
  },
  statCount: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  actionsSection: {
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.l,
  },
  actionsList: {
    gap: SPACING.s,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    gap: SPACING.m,
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  actionButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  actionButtonTextDanger: {
    color: COLORS.error,
  },
  reauthSection: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.l,
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
  },
  reauthDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
  },
  reauthInput: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    marginBottom: SPACING.m,
  },
  reauthButtons: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  reauthButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  reauthCancelButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  reauthConfirmButton: {
    backgroundColor: COLORS.error,
  },
  reauthCancelText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
  reauthConfirmText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
});
