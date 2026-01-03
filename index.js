import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import widgetTaskHandler from './src/widgets/widget-task-handler';

// Register the widget task handler
registerWidgetTaskHandler(widgetTaskHandler);

// Must be exported or used in registerRootComponent
export function App() {
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
