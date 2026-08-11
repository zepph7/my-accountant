const { brand, light, dark } = require('./constants/palette');

/**
 * Colours are required from `constants/palette.js` rather than written out
 * here, so the NativeWind classes and the `@expo/ui` modifiers in
 * `constants/colors.ts` are the same values by construction.
 *
 * Light-scheme tokens keep their plain names (`bg-surface`, `text-ink`); the
 * dark scheme is namespaced under `night` and reached with the `dark:` variant
 * (`dark:bg-night-surface`). NativeWind follows the device appearance, which
 * `app.json` already sets to `automatic`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: brand.primary,
          dark: brand.primaryDark,
          light: brand.primaryLight,
        },
        secondary: brand.secondary,

        background: light.background,
        surface: light.surface,
        border: light.border,
        ink: light.ink,
        muted: light.muted,

        success: light.success,
        warning: light.warning,
        error: light.error,

        night: {
          primary: dark.primary,
          background: dark.background,
          surface: dark.surface,
          border: dark.border,
          ink: dark.ink,
          muted: dark.muted,
          success: dark.success,
          warning: dark.warning,
          error: dark.error,
        },
      },
    },
  },
  plugins: [],
};
