/** @type {import('jest').Config} */
module.exports = {
  // Don't use preset - configure manually to avoid react-native/jest/setup.js ESM issue
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/assets/.*\\.(png|jpg|jpeg|gif|webp|svg|mp4)$': '<rootDir>/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/$1',
    // Mock react-native entirely for unit testing pure functions
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '\\.(png|jpg|jpeg|gif|webp|svg|mp4)$': '<rootDir>/__mocks__/fileMock.js',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm/)?(' +
      '@react-native(-community)?|' +
      '@react-native\\/.*|' +
      'expo(nent)?|' +
      '@expo(nent)?\\/.*|' +
      '@tanstack\\/.*|' +
      '@nkzw\\+.*|' + // pnpm uses + instead of / for scoped packages
      '@nkzw\\/.*' +
      '))',
  ],
  collectCoverageFrom: [
    'src/utils/**/*.{ts,tsx}',
    'src/hooks/**/*.{ts,tsx}',
    'src/components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  clearMocks: true,
};
