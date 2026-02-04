import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { COLORS } from '@/src/constants/theme';
import { AccentColorContext } from '@/src/context/AccentColorProvider';
import i18n from '@/src/i18n';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const accentColor = this.context?.accentColor ?? DEFAULT_ACCENT_COLOR;

      return (
        <View style={styles.container} testID="error-boundary-fallback">
          <Text style={styles.emoji}>😵</Text>
          <Text style={styles.title}>{i18n.t('errors.generic')}</Text>
          <Text style={styles.message}>
            {this.state.error?.message || i18n.t('errors.unexpectedError')}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: accentColor }]}
            onPress={this.handleReset}
            testID="error-boundary-retry"
          >
            <Text style={styles.buttonText}>{i18n.t('errors.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 280,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorBoundary;
