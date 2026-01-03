const { withAndroidManifest } = require('@expo/config-plugins');

const withWidgetManifestFix = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (mainApplication.receiver) {
      mainApplication.receiver.forEach((receiver) => {
        if (
          receiver.$ &&
          (receiver.$['android:name'].includes('UpcomingMoviesWidgetProvider') ||
            receiver.$['android:name'].includes('UpcomingTVWidgetProvider') ||
            receiver.$['android:name'].includes('WatchlistWidgetProvider'))
        ) {
          receiver.$['android:exported'] = 'true';
        }
      });
    }

    return config;
  });
};

module.exports = withWidgetManifestFix;
