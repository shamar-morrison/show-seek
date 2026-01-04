const { withMainApplication } = require('@expo/config-plugins');

const withSharedDataPackage = (config) => {
  return withMainApplication(config, (config) => {
    let mainApplication = config.modResults.contents;

    // Add import if not present
    if (!mainApplication.includes('import app.horizon.showseek.SharedDataPackage')) {
      const newContent = mainApplication.replace(
        'import expo.modules.ReactNativeHostWrapper',
        'import expo.modules.ReactNativeHostWrapper\nimport app.horizon.showseek.SharedDataPackage'
      );
      if (newContent === mainApplication) {
        throw new Error(
          'Failed to add SharedDataPackage import: could not find ReactNativeHostWrapper import'
        );
      }
      mainApplication = newContent;
    }

    // Add package to getPackages() list
    if (!mainApplication.includes('add(SharedDataPackage())')) {
      // Look for the PackageList line or the manual add comment
      if (mainApplication.includes('// add(MyReactNativePackage())')) {
        mainApplication = mainApplication.replace(
          '// add(MyReactNativePackage())',
          '// add(MyReactNativePackage())\n              add(SharedDataPackage())'
        );
      } else if (mainApplication.includes('PackageList(this).packages.apply {')) {
        mainApplication = mainApplication.replace(
          'PackageList(this).packages.apply {',
          'PackageList(this).packages.apply {\n              add(SharedDataPackage())'
        );
      } else {
        throw new Error(
          'Failed to add SharedDataPackage: could not find package registration location'
        );
      }
    }

    config.modResults.contents = mainApplication;
    return config;
  });
};

module.exports = withSharedDataPackage;
