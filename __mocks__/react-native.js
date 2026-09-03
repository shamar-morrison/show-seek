// Minimal react-native mock for unit testing
// This mock provides string-based components for testing-library compatibility

const React = require('react');
const { jest } = require('@jest/globals');

// Create proper mock components
const createMockComponent = (name) => {
  const Component = (props) => {
    return React.createElement(name, props);
  };
  Component.displayName = name;
  return Component;
};

const createTouchable = (name) => {
  const Component = ({ disabled, onPress, testID, accessibilityState, ...props }) => {
    let nextAccessibilityState = accessibilityState;
    if (disabled) {
      nextAccessibilityState = {
        ...accessibilityState,
        disabled: true,
      };
    }

    return React.createElement(name, {
      ...props,
      testID,
      disabled,
      ...(nextAccessibilityState ? { accessibilityState: nextAccessibilityState } : {}),
      ...(disabled ? { 'aria-disabled': true } : {}),
      onPress: disabled ? undefined : onPress,
    });
  };
  Component.displayName = name;
  return Component;
};

const flattenStyle = (style) => {
  if (style === null || typeof style !== 'object') {
    return undefined;
  }
  if (!Array.isArray(style)) {
    return style;
  }
  const result = {};
  for (let i = 0; i < style.length; ++i) {
    const computedStyle = flattenStyle(style[i]);
    if (computedStyle) {
      Object.assign(result, computedStyle);
    }
  }
  return result;
};

module.exports = {
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios ?? obj.default,
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: flattenStyle,
  },
  Dimensions: {
    get: () => ({ width: 375, height: 812 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Image: 'Image',
  ImageBackground: 'ImageBackground',
  TouchableOpacity: createTouchable('TouchableOpacity'),
  TouchableHighlight: createTouchable('TouchableHighlight'),
  TouchableWithoutFeedback: createTouchable('TouchableWithoutFeedback'),
  Pressable: createTouchable('Pressable'),
  ScrollView: 'ScrollView',
  RefreshControl: 'RefreshControl',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  Switch: 'Switch',
  Alert: {
    alert: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
    openSettings: jest.fn(() => Promise.resolve()),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
  },
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
    Image: 'Animated.Image',
    ScrollView: 'Animated.ScrollView',
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(),
    })),
    timing: jest.fn(() => ({
      start: jest.fn((cb) => cb && cb()),
    })),
    spring: jest.fn(() => ({
      start: jest.fn((cb) => cb && cb()),
    })),
    parallel: jest.fn(() => ({
      start: jest.fn((cb) => cb && cb()),
    })),
    sequence: jest.fn(() => ({
      start: jest.fn((cb) => cb && cb()),
    })),
    event: jest.fn(),
    createAnimatedComponent: jest.fn((component) => component),
  },
  NativeModules: {},
  StatusBar: {
    setBarStyle: jest.fn(),
    setHidden: jest.fn(),
  },
  SafeAreaView: 'SafeAreaView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  useWindowDimensions: () => ({ width: 375, height: 812 }),
  useColorScheme: () => 'dark',
};
