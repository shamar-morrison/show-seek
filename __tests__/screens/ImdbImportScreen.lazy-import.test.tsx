import { render } from '@testing-library/react-native';
import React from 'react';

describe('ImdbImportScreen lazy native imports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without resolving the document picker on mount', () => {
    const mockHttpsCallable = jest.fn((_functions: unknown, _name: unknown) => jest.fn());
    const mockDocumentPickerFactory = jest.fn(() => {
      throw new Error('expo-document-picker should not load during screen render');
    });
    const mockFileSystemFactory = jest.fn(() => {
      throw new Error('expo-file-system should not load during screen render');
    });

    jest.isolateModules(() => {
      jest.doMock('react', () => React);
      jest.doMock('expo-router', () => ({
        useRouter: () => ({
          back: jest.fn(),
          push: jest.fn(),
          replace: jest.fn(),
        }),
      }));
      jest.doMock('expo-image', () => ({
        Image: 'Image',
      }));
      jest.doMock('expo-haptics', () => ({
        impactAsync: jest.fn(),
        ImpactFeedbackStyle: {
          Light: 'Light',
        },
      }));
      jest.doMock('react-native-safe-area-context', () => {
        const React = require('react');
        return {
          SafeAreaView: ({ children }: { children: any }) =>
            React.createElement(React.Fragment, null, children),
        };
      });
      jest.doMock('@/src/context/PremiumContext', () => ({
        usePremium: () => ({
          isLoading: false,
          isPremium: true,
        }),
      }));
      jest.doMock('@/src/context/AccentColorProvider', () => ({
        useAccentColor: () => ({
          accentColor: '#ff5500',
        }),
      }));
      jest.doMock('@/src/hooks/useAccountRequired', () => ({
        useAccountRequired: () => () => false,
      }));
      jest.doMock('@/src/components/ui/CollapsibleCategory', () => {
        const React = require('react');
        const { Text, View } = require('react-native');

        return {
          CollapsibleCategory: ({ children, title }: { children: any; title: string }) =>
            React.createElement(
              View,
              null,
              React.createElement(Text, null, title),
              children
            ),
          CollapsibleFeatureItem: ({
            description,
            text,
          }: {
            description?: string;
            text: string;
          }) =>
            React.createElement(
              View,
              null,
              React.createElement(Text, null, text),
              description ? React.createElement(Text, null, description) : null
            ),
        };
      });
      jest.doMock('@/src/components/ui/PremiumBadge', () => ({
        PremiumBadge: () => {
          const React = require('react');
          const { Text } = require('react-native');
          return React.createElement(Text, { testID: 'premium-badge' }, 'Premium');
        },
      }));
      jest.doMock('@/src/firebase/config', () => ({
        functions: {},
      }));
      jest.doMock('firebase/functions', () => ({
        httpsCallable: mockHttpsCallable,
      }));
      jest.doMock('expo-document-picker', mockDocumentPickerFactory);
      jest.doMock('expo-file-system/legacy', mockFileSystemFactory);

      const { ImdbImportFlowProvider } = require('@/src/context/ImdbImportFlowContext');
      const ImdbImportScreen = require('@/src/screens/ImdbImportScreen').default;

      const screen = render(
        React.createElement(
          ImdbImportFlowProvider,
          null,
          React.createElement(ImdbImportScreen)
        )
      );

      expect(screen.getByText('Import your IMDb data')).toBeTruthy();
    });

    expect(mockDocumentPickerFactory).not.toHaveBeenCalled();
    expect(mockFileSystemFactory).not.toHaveBeenCalled();
  });
});
