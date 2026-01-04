const { withAndroidManifest } = require('@expo/config-plugins');

const withWidgetManifestFix = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (mainApplication.receiver) {
      mainApplication.receiver.forEach((receiver) => {
        if (receiver.$ && receiver.$['android:name']) {
          const name = receiver.$['android:name'];
          if (
            name.endsWith('UpcomingMoviesWidgetProvider') ||
            name.endsWith('UpcomingTVWidgetProvider') ||
            name.endsWith('WatchlistWidgetProvider')
          ) {
            receiver.$['android:exported'] = 'true';
          }
        }
      });
    }

    return config;
  });
};

module.exports = withWidgetManifestFix;
