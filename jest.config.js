/** @type {import('jest').Config} */
module.exports = {
  projects: [
    // ── App tests (React Native / Expo) ──
    {
      displayName: 'app',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)'],
      testPathIgnorePatterns: ['<rootDir>/__tests__/functions/'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      moduleNameMapper: {
        '^@/assets/.*\\.(png|jpg|jpeg|gif|webp|svg|mp4)$': '<rootDir>/__mocks__/fileMock.js',
        '^@/(.*)$': '<rootDir>/$1',
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
          '@nkzw\\+.*|' +
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
    },

    // ── Cloud Functions tests (plain Node.js / TypeScript) ──
    {
      displayName: 'functions',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/functions/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'js', 'json', 'node'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^googleapis$': '<rootDir>/__mocks__/googleapis.js',
        '^firebase-functions/v2/https$': '<rootDir>/__mocks__/firebase-functions-v2-https.js',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/functions/tsconfig.json',
            diagnostics: false,
            isolatedModules: true,
          },
        ],
      },
      clearMocks: true,
    },
  ],
};
