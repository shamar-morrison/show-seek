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
const mockUseLists = jest.fn();

jest.mock('@/src/hooks/useLists', () => ({
  useLists: (...args: any[]) => mockUseLists(...args),
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
    mockUseLists.mockReturnValue(mockListsState);
  });

  it('does not render delete controls for default lists', () => {
    const { UNSAFE_queryAllByType } = render(<ManageListsScreen />);

    expect(mockUseLists).toHaveBeenCalledWith({ accessScope: 'list-management' });
    expect(UNSAFE_queryAllByType(Trash2)).toHaveLength(0);
  });
});
