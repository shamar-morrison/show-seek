import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { updateProfile } from 'firebase/auth';
import { Edit2 } from 'lucide-react-native';

export function ProfileInfo() {
  const { user } = useAuth();
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const currentDisplayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';

  const handleUpdateDisplayName = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }

    if (!user) return;

    setIsUpdating(true);
    try {
      await updateProfile(user, {
        displayName: displayName.trim(),
      });
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Display name updated successfully');
    } catch (error) {
      console.error('Error updating display name:', error);
      Alert.alert('Error', 'Failed to update display name');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <View style={styles.textContainer}>
          <Text style={styles.displayName}>{currentDisplayName}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>
        
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => {
            setDisplayName(user?.displayName || '');
            setIsEditModalVisible(true);
          }}
        >
          <Edit2 size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Display Name</Text>
            
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              placeholderTextColor={COLORS.textSecondary}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsEditModalVisible(false)}
                disabled={isUpdating}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleUpdateDisplayName}
                disabled={isUpdating}
              >
                <Text style={styles.saveButtonText}>
                  {isUpdating ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    marginBottom: SPACING.l,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
  },
  displayName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  email: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  editButton: {
    padding: SPACING.s,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    marginLeft: SPACING.m,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.l,
  },
  input: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    marginBottom: SPACING.l,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  modalButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
});
