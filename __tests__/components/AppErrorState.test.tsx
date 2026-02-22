import AppErrorState from '@/src/components/ui/AppErrorState';
import { SPACING } from '@/src/constants/theme';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const hasActionsContainerStyle = (node: unknown): boolean => {
  if (!node) {
    return false;
  }

  if (Array.isArray(node)) {
    return node.some((child) => hasActionsContainerStyle(child));
  }

  if (typeof node !== 'object') {
    return false;
  }

  const typedNode = node as {
    props?: { style?: unknown };
    children?: unknown[];
  };
  const style = typedNode.props?.style;
  const styleEntries = Array.isArray(style) ? style : [style];
  const matchesActionsStyle = styleEntries.some(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      (entry as { width?: unknown }).width === '100%' &&
      (entry as { marginTop?: unknown }).marginTop === SPACING.l &&
      (entry as { gap?: unknown }).gap === SPACING.s
  );

  if (matchesActionsStyle) {
    return true;
  }

  return Array.isArray(typedNode.children) && typedNode.children.some((child) => hasActionsContainerStyle(child));
};

describe('AppErrorState', () => {
  const originalDev = (global as any).__DEV__;

  afterEach(() => {
    (global as any).__DEV__ = originalDev;
    jest.clearAllMocks();
  });

  it('shows network-specific friendly copy for connectivity errors', () => {
    const { getByText } = render(
      <AppErrorState error={{ code: 'ERR_NETWORK', message: 'Network Error' }} message="Fallback" />
    );

    expect(getByText('Network error. Please check your connection.')).toBeTruthy();
  });

  it('uses caller fallback message for generic errors', () => {
    const { getByText } = render(<AppErrorState error={new Error('Boom')} message="Friendly fallback" />);

    expect(getByText('Friendly fallback')).toBeTruthy();
  });

  it('shows technical details only in dev mode', () => {
    (global as any).__DEV__ = true;

    const { getByText } = render(
      <AppErrorState error={new Error('Low-level failure')} message="Friendly fallback" />
    );

    expect(getByText('Debug')).toBeTruthy();
    expect(getByText('Low-level failure')).toBeTruthy();
  });

  it('hides technical details in non-dev mode', () => {
    (global as any).__DEV__ = false;

    const { queryByText } = render(
      <AppErrorState error={new Error('Low-level failure')} message="Friendly fallback" />
    );

    expect(queryByText('Debug')).toBeNull();
    expect(queryByText('Low-level failure')).toBeNull();
  });

  it('does not render actions container when no actions are provided', () => {
    const { toJSON } = render(<AppErrorState error={new Error('Failure')} message="Friendly fallback" />);

    expect(hasActionsContainerStyle(toJSON())).toBe(false);
  });

  it('fires primary and secondary actions', () => {
    const onRetry = jest.fn();
    const onSecondaryAction = jest.fn();

    const { getByText } = render(
      <AppErrorState
        error={new Error('Failure')}
        message="Friendly"
        onRetry={onRetry}
        retryLabel="Retry now"
        onSecondaryAction={onSecondaryAction}
        secondaryActionLabel="Go back now"
      />
    );

    fireEvent.press(getByText('Retry now'));
    fireEvent.press(getByText('Go back now'));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });
});
