const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidPermissionsFilter = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    
    // Ensure tools namespace is declared on the manifest tag
    if (!androidManifest.manifest.$) {
      androidManifest.manifest.$ = {};
    }
    androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Ensure uses-permission array exists
    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    const permissionsToRemove = [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ];

    permissionsToRemove.forEach((permissionName) => {
      // Check if permission already exists in uses-permission array
      const existingIndex = androidManifest.manifest['uses-permission'].findIndex(
        (p) => p.$ && p.$['android:name'] === permissionName
      );

      if (existingIndex > -1) {
        // If it exists, add tools:node="remove"
        androidManifest.manifest['uses-permission'][existingIndex].$['tools:node'] = 'remove';
      } else {
        // If it doesn't exist, append it with tools:node="remove"
        androidManifest.manifest['uses-permission'].push({
          $: {
            'android:name': permissionName,
            'tools:node': 'remove',
          },
        });
      }
    });

    return config;
  });
};

module.exports = withAndroidPermissionsFilter;
