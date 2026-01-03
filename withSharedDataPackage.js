const { withMainApplication } = require('@expo/config-plugins');

const withSharedDataPackage = (config) => {
  return withMainApplication(config, async (config) => {
    let mainApplication = config.modResults.contents;

    // Add import if not present
    if (!mainApplication.includes('import app.horizon.showseek.SharedDataPackage')) {
      mainApplication = mainApplication.replace(
        'import expo.modules.ReactNativeHostWrapper',
        'import expo.modules.ReactNativeHostWrapper\nimport app.horizon.showseek.SharedDataPackage'
      );
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
      }
    }

    config.modResults.contents = mainApplication;
    return config;
  });
};

module.exports = withSharedDataPackage;
