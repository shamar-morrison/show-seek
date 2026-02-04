import React from 'react';
import { View } from 'react-native';
import { Search } from 'lucide-react-native';
import { EmptyState } from '@/src/components/library/EmptyState';
import { useTranslation } from 'react-i18next';

interface SearchEmptyStateProps {
  height?: number;
}

export function SearchEmptyState({ height }: SearchEmptyStateProps) {
  const { t } = useTranslation();

  const content = (
    <EmptyState
      icon={Search}
      title={t('common.noResults')}
      description={t('search.adjustSearch')}
    />
  );

  if (height === undefined) {
    return content;
  }

  return <View style={{ height }}>{content}</View>;
}
