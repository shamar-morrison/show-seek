import React from 'react';
import { View } from 'react-native';
import { Search } from 'lucide-react-native';
import { EmptyState } from '@/src/components/library/EmptyState';

interface SearchEmptyStateProps {
  height?: number;
}

export function SearchEmptyState({ height }: SearchEmptyStateProps) {
  const content = (
    <EmptyState
      icon={Search}
      title="No results found"
      description="Try a different search term."
    />
  );

  if (height === undefined) {
    return content;
  }

  return <View style={{ height }}>{content}</View>;
}
