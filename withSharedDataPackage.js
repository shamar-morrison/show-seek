const { withMainActivity, withMainApplication } = require('@expo/config-plugins');

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

const WIDGET_TARGET_COMPANION = `
  companion object {
    @Volatile var pendingWidgetTarget: String? = null
      private set

    fun consumeWidgetTarget(): String? {
      val target = pendingWidgetTarget
      pendingWidgetTarget = null
      return target
    }

    private const val ACTION_WIDGET_TAP = "app.horizon.showseek.action.WIDGET_TAP"

    fun widgetTargetFromIntent(intent: android.content.Intent?): String? {
      if (intent?.action != ACTION_WIDGET_TAP) return null
      return when (intent.getStringExtra("widget_kind")) {
        "watchlist" -> "watchlist:\${intent.getStringExtra("widget_list_id").orEmpty()}"
        "upcoming_movies", "upcoming_tv" -> intent.getStringExtra("widget_kind")
        else -> null
      }
    }
  }
`;

const WIDGET_TARGET_ON_NEW_INTENT = `
  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    widgetTargetFromIntent(intent)?.let { pendingWidgetTarget = it }
  }
`;

// Captures widget tap targets from the launch/new intent so JS can navigate
// after boot. Widget taps use explicit intents (no data URI) so cold boot is
// identical to a launcher launch; the target is consumed via
// SharedDataModule.getLaunchWidgetTarget().
// NOTE: MainActivity (not MainApplication) — uses withMainActivity.
const withWidgetTapTarget = (config) => {
  return withMainActivity(config, (config) => {
    let mainApplication = config.modResults.contents;

    if (!mainApplication.includes('pendingWidgetTarget')) {
      const classAnchor = 'class MainActivity : ReactActivity() {';
      if (!mainApplication.includes(classAnchor)) {
        throw new Error(
          'Failed to add widget tap target capture: could not find MainActivity class declaration'
        );
      }
      mainApplication = mainApplication.replace(
        classAnchor,
        `${classAnchor}${WIDGET_TARGET_COMPANION}`
      );
    }

    if (!mainApplication.includes('pendingWidgetTarget = widgetTargetFromIntent(intent)')) {
      const superOnCreate = 'super.onCreate(null)';
      if (!mainApplication.includes(superOnCreate)) {
        throw new Error(
          'Failed to add widget tap target capture: could not find super.onCreate call'
        );
      }
      mainApplication = mainApplication.replace(
        superOnCreate,
        `${superOnCreate}\n    pendingWidgetTarget = widgetTargetFromIntent(intent)`
      );
    }

    if (!mainApplication.includes('override fun onNewIntent')) {
      const backButtonAnchor = '  /**\n   * Align the back button behavior with Android S';
      if (mainApplication.includes(backButtonAnchor)) {
        mainApplication = mainApplication.replace(
          backButtonAnchor,
          `${WIDGET_TARGET_ON_NEW_INTENT}\n${backButtonAnchor}`
        );
      } else {
        // Fallback: append before the final closing brace of the class.
        const trimmed = mainApplication.trimEnd();
        if (!trimmed.endsWith('}')) {
          throw new Error(
            'Failed to add onNewIntent: could not find class closing brace'
          );
        }
        mainApplication =
          trimmed.slice(0, -1) + `${WIDGET_TARGET_ON_NEW_INTENT}}\n`;
      }
    }

    config.modResults.contents = mainApplication;
    return config;
  });
};

module.exports = (config) => withWidgetTapTarget(withSharedDataPackage(config));
