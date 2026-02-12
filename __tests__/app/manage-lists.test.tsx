import React from 'react';
import { render } from '@testing-library/react-native';
import { Trash2 } from 'lucide-react-native';

const mockListsState = {
  data: [
    {
      id: 'watchlist',
      name: 'Watchlist',
      items: {},
    },
  ],
  isLoading: false,
};

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
  useDeleteList: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/src/components/RenameListModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
    RenameListModalRef: {},
  };
});

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import ManageListsScreen from '@/app/manage-lists';

describe('ManageListsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render delete controls for default lists', () => {
    const { UNSAFE_queryAllByType } = render(<ManageListsScreen />);

    expect(UNSAFE_queryAllByType(Trash2)).toHaveLength(0);
  });
});
