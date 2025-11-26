import React from 'react';
import { Alert, Linking } from 'react-native';

interface VideoPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  videoKey: string | null;
  videoTitle?: string;
}

export default function VideoPlayerModal({
  visible,
  onClose,
  videoKey,
  videoTitle,
}: VideoPlayerModalProps) {
  const youtubeUrl = videoKey ? `https://www.youtube.com/watch?v=${videoKey}` : null;

  React.useEffect(() => {
    if (visible && youtubeUrl) {
      // Immediately open in YouTube app/browser
      Linking.canOpenURL(youtubeUrl).then((supported) => {
        if (supported) {
          Linking.openURL(youtubeUrl);
          onClose();
        } else {
          Alert.alert('Error', 'Unable to open video');
          onClose();
        }
      });
    }
  }, [visible, youtubeUrl]);

  return null;
}
