module.exports = function (api) {
  api.cache(true);

  const plugins = [];

  // Remove console statements in production, keep errors/warns for crash reporting
  if (process.env.NODE_ENV === 'production') {
    plugins.push([
      'transform-remove-console',
      {
        // exclude: ['error', 'warn'],
      },
    ]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins: [...plugins, 'react-native-reanimated/plugin'],
  };
};
