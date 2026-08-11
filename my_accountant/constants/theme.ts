/**
 * Typography, layout constants, and the navigation-level colour map.
 *
 * Colour itself lives in `constants/palette.js` (shared with Tailwind) and is
 * exposed with types by `constants/colors.ts`. This file only arranges those
 * values and adds the type scale.
 */

import { Platform } from 'react-native';
import { Colors as ThemeColors } from './colors';

/**
 * The colour map consumed by the Expo scaffolding components (`ThemedText`,
 * `ThemedView`, the tab bar). Re-pointed at the brand palette so those screens
 * match the auth screens instead of keeping the starter template's teal.
 */
export const Colors = {
  light: {
    text: ThemeColors.light.ink,
    background: ThemeColors.light.background,
    tint: ThemeColors.light.primary,
    icon: ThemeColors.light.muted,
    tabIconDefault: ThemeColors.light.muted,
    tabIconSelected: ThemeColors.light.primary,
  },
  dark: {
    text: ThemeColors.dark.ink,
    background: ThemeColors.dark.background,
    tint: ThemeColors.dark.primary,
    icon: ThemeColors.dark.muted,
    tabIconDefault: ThemeColors.dark.muted,
    tabIconSelected: ThemeColors.dark.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * One register: the platform's own sans, at a small number of sizes.
 *
 * The first pass set field labels in 11pt uppercase monospace with wide
 * tracking. It rendered exactly as specified and was hard to read — small,
 * tracked, all-caps and mono is four legibility penalties stacked on the one
 * element that tells you what to type. Exchange apps set labels in plain small
 * sentence-case grey for that reason, and so does this now.
 */
export const Type = {
  /** Screen heading. */
  display: {
    fontFamily: Fonts.sans,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  /** Screen title on the signed-in screens, which sit under a nav bar. */
  title: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  /** A section heading inside a screen. */
  section: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
  },
  /**
   * A figure that has to be read, not skimmed — balances, totals, the amount on
   * a row. Sizes differ; the weight and tight tracking do not.
   */
  amount: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  /** Body copy under the heading. */
  body: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  /** Field labels. */
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  /** Text inside a field. */
  field: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '400',
  },
  /** Button labels. */
  action: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '600',
  },
  /** Inline text actions — Show, Forgot, the tab labels. */
  link: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  /** Validation messages and fine print. */
  caption: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
} as const;

/** Corner radius shared by fields and buttons. */
export const RADIUS = 8;

/**
 * Vertical padding inside a text input.
 *
 * Inputs are sized by padding, not by a fixed height. The first build set
 * `height: 54` and the text drew hard against the top edge of the box, because
 * the Android input is an unstyled Compose `BasicTextField` with no vertical
 * alignment control. Padding centres the text by construction.
 */
export const FIELD_PADDING_Y = 17;

/** Height of the buttons, which are React Native views and can be sized directly. */
export const BUTTON_HEIGHT = 58;
