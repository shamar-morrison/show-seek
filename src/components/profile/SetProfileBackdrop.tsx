import { ProfileBackdropPositioner } from '@/src/components/profile/ProfileBackdropPositioner';
import { useProfileBackground } from '@/src/hooks/useProfileBackground';
import type { ProfileBackground, ProfileBackgroundFocus } from '@/src/utils/profileBackground';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SetProfileBackdropProps {
  image: ProfileBackground;
  /** Closes the step: after saving (with a message to show), or on cancel (no message). */
  onClose: (message?: string) => void;
  onShowToast: (message: string) => void;
}

/** "Position backdrop" in the image viewer: choosing a part and saving it as the profile backdrop. */
export function SetProfileBackdrop({ image, onClose, onShowToast }: SetProfileBackdropProps) {
  const { t } = useTranslation();
  const { setProfileBackground } = useProfileBackground();
  const [isSaving, setIsSaving] = useState(false);

  const handleConfirm = useCallback(
    async (focus: ProfileBackgroundFocus) => {
      setIsSaving(true);
      try {
        await setProfileBackground({ ...image, focus });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose(t('profile.backgroundSet'));
      } catch (error) {
        console.error('[SetProfileBackdrop] Failed to set the backdrop:', error);
        onShowToast(t('profile.backgroundFailed'));
        setIsSaving(false);
      }
    },
    [image, onClose, onShowToast, setProfileBackground, t]
  );

  return (
    <ProfileBackdropPositioner
      background={image}
      onCancel={() => onClose()}
      onConfirm={handleConfirm}
      confirmLabel={t('common.save')}
      isSaving={isSaving}
    />
  );
}
