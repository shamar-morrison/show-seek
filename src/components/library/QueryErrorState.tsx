import { ErrorState } from '@/src/components/library/ErrorState';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface QueryErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  fallbackMessage?: string;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
};

export function QueryErrorState({
  error,
  onRetry,
  title,
  fallbackMessage,
}: QueryErrorStateProps) {
  const { t } = useTranslation();

  return (
    <ErrorState
      title={title ?? t('common.error')}
      message={getErrorMessage(error, fallbackMessage ?? t('errors.generic'))}
      onRetry={onRetry}
    />
  );
}
