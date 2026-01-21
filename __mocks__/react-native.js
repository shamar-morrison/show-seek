// Minimal react-native mock for unit testing
// This mock provides string-based components for testing-library compatibility

const React = require('react');

// Create proper mock components
const createMockComponent = (name) => {
  const Component = (props) => {
    return React.createElement(name, props);
  };
  Component.displayName = name;
  return Component;
};

const createTouchable = (name) => {
  const Component = ({ disabled, onPress, testID, ...props }) => {
    return React.createElement(name, {
      ...props,
      testID,
      disabled,
      onPress: disabled ? undefined : onPress,
    });
  };
  Component.displayName = name;
  return Component;
};

module.exports = {
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios ?? obj.default,
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
  },
  Dimensions: {
    get: () => ({ width: 375, height: 812 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Image: 'Image',
  TouchableOpacity: createTouchable('TouchableOpacity'),
  TouchableHighlight: createTouchable('TouchableHighlight'),
  TouchableWithoutFeedback: createTouchable('TouchableWithoutFeedback'),
  Pressable: createTouchable('Pressable'),
  ScrollView: 'ScrollView',
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
    canOpenURL: jest.fn(() => Promise.resolve(true)),
  },
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
    Image: 'Animated.Image',
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
