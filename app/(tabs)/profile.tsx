import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/context/auth';
import { ProfileInfo } from '@/src/components/ProfileInfo';
import { ProfileStats } from '@/src/components/ProfileStats';
import { LogOut } from 'lucide-react-native';

export default function ProfileScreen() {
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Profile</Text>
        
        <ProfileInfo />
        
        <ProfileStats />

        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={signOut}
        >
          <LogOut size={20} color={COLORS.text} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
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
    padding: SPACING.m,
    paddingBottom: SPACING.xxl,
  },
  header: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.l,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginTop: SPACING.l,
    gap: SPACING.s,
  },
  logoutText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
});
