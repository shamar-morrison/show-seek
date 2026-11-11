const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const unusedImports = require('eslint-plugin-unused-imports');

// Horizontal scrolls must not bounce at the edges: the spring-back swallows the next tap, so taps
// on the first or last chip/tab/card "do nothing". HORIZONTAL_SCROLL_PROPS (which sets
// `horizontal` itself) and HorizontalFlashList turn the bounce off, so a `horizontal` prop written
// directly on a scroll component means the fix was left out. Full-screen pagers (`pagingEnabled`)
// are allowed: you swipe them rather than tap at their edges.
const SCROLL_COMPONENTS = '/^(ScrollView|FlatList|FlashList|SectionList)$/';
const HAS_RAW_HORIZONTAL =
  ":has(> JSXAttribute[name.name='horizontal']):not(:has(> JSXAttribute[name.name='pagingEnabled']))";
const HORIZONTAL_SCROLL_MESSAGE =
  'Horizontal scrolls must not bounce at the edges (it swallows taps on the end items). Spread ' +
  'HORIZONTAL_SCROLL_PROPS from src/components/ui/horizontalScrollProps instead of `horizontal`, ' +
  'or use HorizontalFlashList.';

module.exports = defineConfig([
  expoConfig,
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `JSXOpeningElement[name.name=${SCROLL_COMPONENTS}]${HAS_RAW_HORIZONTAL}`,
          message: HORIZONTAL_SCROLL_MESSAGE,
        },
        {
          // Animated.ScrollView, Animated.FlatList and the like.
          selector: `JSXOpeningElement[name.property.name=${SCROLL_COMPONENTS}]${HAS_RAW_HORIZONTAL}`,
          message: HORIZONTAL_SCROLL_MESSAGE,
        },
      ],
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
