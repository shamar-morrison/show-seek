import { logModalEvent } from '@/src/services/analytics';
import React, { useCallback, useEffect, useRef } from 'react';
import { Modal, type ModalProps, Platform } from 'react-native';

interface LoggedModalProps extends ModalProps {
  name: string;
}

export function LoggedModal({
  name,
  onDismiss,
  onShow,
  visible = false,
  ...modalProps
}: LoggedModalProps) {
  const previousVisibleRef = useRef(Boolean(visible));
  const dismissLoggedRef = useRef(!visible);

  const logDismiss = useCallback(() => {
    if (dismissLoggedRef.current) {
      return;
    }

    dismissLoggedRef.current = true;
    void logModalEvent(name, 'dismiss');
  }, [name]);

  useEffect(() => {
    const wasVisible = previousVisibleRef.current;
    const isVisible = Boolean(visible);

    if (Platform.OS === 'android' && wasVisible && !isVisible) {
      logDismiss();
    }

    previousVisibleRef.current = isVisible;
  }, [logDismiss, visible]);

  const handleShow = useCallback(
    (event: Parameters<NonNullable<ModalProps['onShow']>>[0]) => {
      dismissLoggedRef.current = false;
      void logModalEvent(name, 'present');
      onShow?.(event);
    },
    [name, onShow]
  );

  const handleDismiss = useCallback(() => {
    logDismiss();
    onDismiss?.();
  }, [logDismiss, onDismiss]);

  return (
    <Modal
      {...modalProps}
      visible={visible}
      onShow={handleShow}
      onDismiss={handleDismiss}
    />
  );
}
