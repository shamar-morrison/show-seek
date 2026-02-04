import React from 'react';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';

interface SearchHeaderOptionsParams {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  placeholder?: string;
}

export const getSearchHeaderOptions = ({
  searchQuery,
  onSearchChange,
  onClose,
  placeholder,
}: SearchHeaderOptionsParams) => ({
  headerTitle: () => null,
  headerRight: () => null,
  header: () => (
    <SearchableHeader
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      onClose={onClose}
      placeholder={placeholder}
    />
  ),
});
