import AppErrorState from '@/src/components/ui/AppErrorState';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface QueryErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  fallbackMessage?: string;
}

export function QueryErrorState({
  error,
  onRetry,
  title,
  fallbackMessage,
}: QueryErrorStateProps) {
  const { t } = useTranslation();

  return (
    <AppErrorState
      error={error}
      title={title ?? t('common.error')}
      message={fallbackMessage ?? t('errors.generic')}
      onRetry={onRetry}
    />
  );
}
