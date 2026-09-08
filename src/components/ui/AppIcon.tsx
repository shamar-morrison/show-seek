import { COLORS } from '@/src/constants/theme';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export type { IconSvgElement };

/**
 * Central app icon component backed by HugeIcons (same pack as show-seek-web).
 *
 * Mirrors the subset of the lucide-react-native prop shape the codebase relies on
 * (`size` / `color` / `strokeWidth` / `fill` / `opacity` / `style`) so call sites
 * stay terse: `<AppIcon icon={Search01Icon} size={22} color={COLORS.text} />`.
 *
 * Notes:
 * - `fill` reproduces Lucide's filled states (e.g. rated stars): pass the same
 *   color as `color` to fill, or `'transparent'`/omit for outline. It is only
 *   forwarded when defined — forwarding `fill={undefined}` would clobber the
 *   renderer's `fill="none"` default and paint every glyph black.
 * - Default `strokeWidth` is left undefined so icons render at the HugeIcons
 *   1.5px design weight (matches web). Pass explicitly to override.
 * - `style` is applied via a wrapper View because HugeIconsIcon accepts a
 *   `style` prop but silently drops it instead of applying it to the Svg.
 */
interface AppIconProps {
  icon: IconSvgElement;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AppIcon({
  icon,
  size = 24,
  color = COLORS.text,
  strokeWidth,
  fill,
  opacity,
  style,
  testID,
}: AppIconProps) {
  const renderedIcon = (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color={color}
      {...(strokeWidth !== undefined ? { strokeWidth } : null)}
      {...(fill !== undefined ? { fill } : null)}
      {...(opacity !== undefined ? { opacity } : null)}
      {...(style === undefined && testID !== undefined ? { testID } : null)}
    />
  );

  if (style === undefined) {
    return renderedIcon;
  }

  return (
    <View style={style} {...(testID !== undefined ? { testID } : null)}>
      {renderedIcon}
    </View>
  );
}
