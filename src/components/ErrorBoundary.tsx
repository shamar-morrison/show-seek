import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { AccentColorContext } from '@/src/context/AccentColorProvider';
import i18n from '@/src/i18n';
import * as Updates from 'expo-updates';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Platform } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in child components.
 * Displays a fallback UI when an error occurs instead of crashing the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  static contextType = AccentColorContext;
  context: React.ContextType<typeof AccentColorContext> = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = async (): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
        return;
      }

      if (typeof Updates.reloadAsync !== 'function') {
        throw new Error('expo-updates reloadAsync is unavailable');
      }

      await Updates.reloadAsync();
    } catch (error) {
      console.error('[ErrorBoundary] Failed to reload app from fallback UI', error);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const accentColor = this.context?.accentColor ?? DEFAULT_ACCENT_COLOR;

      return (
        <AppErrorState
          testID="error-boundary-fallback"
          error={this.state.error}
          title={i18n.t('errors.generic')}
          message={this.state.error?.message || i18n.t('errors.unexpectedError')}
          onRetry={this.handleReset}
          retryLabel={i18n.t('errors.tryAgain')}
          retryTestID="error-boundary-retry"
          onSecondaryAction={() => {
            void this.handleReload();
          }}
          secondaryActionLabel={i18n.t('errors.reloadApp')}
          secondaryActionTestID="error-boundary-reload"
          accentColor={accentColor}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
