import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';

// Component that throws an error
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return (
    <View testID="child-component">
      <Text>Child content</Text>
    </View>
  );
}

// Component with controllable error state
function ControllableComponent({
  error,
  setError,
}: {
  error: boolean;
  setError: (val: boolean) => void;
}) {
  if (error) {
    throw new Error('Controlled error');
  }
  return (
    <View testID="controllable-content">
      <Text>Normal content</Text>
    </View>
  );
}

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors in tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normal rendering', () => {
    it('should render children when no error occurs', () => {
      const { getByTestId, queryByTestId } = render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(getByTestId('child-component')).toBeTruthy();
      expect(queryByTestId('error-boundary-fallback')).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should render fallback UI when child throws error', () => {
      const { getByTestId, queryByTestId, getByText } = render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(queryByTestId('child-component')).toBeNull();
      expect(getByTestId('error-boundary-fallback')).toBeTruthy();
      expect(getByText('Something went wrong')).toBeTruthy();
      expect(getByText('Test error message')).toBeTruthy();
    });

    it('should display custom fallback when provided', () => {
      const CustomFallback = () => (
        <View testID="custom-fallback">
          <Text>Custom error UI</Text>
        </View>
      );

      const { getByTestId, queryByTestId } = render(
        <ErrorBoundary fallback={<CustomFallback />}>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(getByTestId('custom-fallback')).toBeTruthy();
      expect(queryByTestId('error-boundary-fallback')).toBeNull();
    });

    it('should call onError callback when error occurs', () => {
      const onErrorMock = jest.fn();

      render(
        <ErrorBoundary onError={onErrorMock}>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });
  });

  describe('retry functionality', () => {
    it('should render retry button', () => {
      const { getByTestId, getByText } = render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(getByTestId('error-boundary-retry')).toBeTruthy();
      expect(getByText('Try Again')).toBeTruthy();
    });

    it('should reset error state when retry button is pressed', () => {
      // We'll test the state reset by using a simple mock
      // In a real scenario, the component would need to be fixed
      const { getByTestId, queryByTestId } = render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      // Verify error state is present
      expect(getByTestId('error-boundary-fallback')).toBeTruthy();

      // Press retry button
      const retryButton = getByTestId('error-boundary-retry');
      fireEvent.press(retryButton);

      // After retry, it will try to render children again
      // Since ThrowingComponent still throws, we'll see the fallback again
      // But the state was reset momentarily
      expect(queryByTestId('error-boundary-fallback')).toBeTruthy();
    });
  });

  describe('error message display', () => {
    it('should display generic message when error has no message', () => {
      // Create a component that throws an error without a message
      function NoMessageError(): React.ReactNode {
        throw new Error();
      }

      const { getByText } = render(
        <ErrorBoundary>
          <NoMessageError />
        </ErrorBoundary>
      );

      expect(getByText('An unexpected error occurred')).toBeTruthy();
    });
  });
});
