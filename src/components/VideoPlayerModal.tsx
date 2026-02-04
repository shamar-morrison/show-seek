import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

interface TrailerPlayerProps {
  visible: boolean;
  onClose: () => void;
  videoKey: string | null;
}

export default function TrailerPlayer({ visible, onClose, videoKey }: TrailerPlayerProps) {
  const { t } = useTranslation();
  const youtubeUrl = videoKey ? `https://www.youtube.com/watch?v=${videoKey}` : null;

  React.useEffect(() => {
    if (visible && youtubeUrl) {
      Linking.openURL(youtubeUrl)
        .then(() => {
          onClose();
        })
        .catch((error) => {
          console.error('Failed to open video URL:', error);
          Alert.alert(t('common.errorTitle'), t('errors.unableToOpenVideo'));
          onClose();
        });
    }
  }, [visible, youtubeUrl, onClose, t]);

  return null;
}
