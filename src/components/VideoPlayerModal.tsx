import React from 'react';
import { Alert, Linking } from 'react-native';

interface TrailerPlayerProps {
  visible: boolean;
  onClose: () => void;
  videoKey: string | null;
}

export default function TrailerPlayer({ visible, onClose, videoKey }: TrailerPlayerProps) {
  const youtubeUrl = videoKey ? `https://www.youtube.com/watch?v=${videoKey}` : null;

  React.useEffect(() => {
    if (visible && youtubeUrl) {
      Linking.openURL(youtubeUrl)
        .then(() => {
          onClose();
        })
        .catch((error) => {
          console.error('Failed to open video URL:', error);
          Alert.alert(
            'Error',
            'Unable to open video. Please make sure you have a web browser or YouTube installed.'
          );
          onClose();
        });
    }
  }, [visible, youtubeUrl]);

  return null;
}
