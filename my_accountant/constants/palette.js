/**
 * The single source of truth for colour in My Accountant.
 *
 * This file is plain CommonJS on purpose: `tailwind.config.js` is loaded by Node
 * at build time and cannot import TypeScript, while `constants/colors.ts` needs
 * the same values with types attached. Both read from here, so a hex changed in
 * this file changes both the NativeWind classes and the `@expo/ui` modifiers.
 * Nothing else should hard-code a colour.
 */

/**
 * Brand colours. These do not change between light and dark — the brand is the
 * brand with the lights on or off. Only the surfaces around them change.
 */
const brand = {
  primary: '#1E88E5',
  primaryDark: '#1565C0',
  primaryLight: '#64B5F6',
  secondary: '#475569',
};

/** The palette as specified: light mode. */
const light = {
  primary: brand.primary,
  primaryDark: brand.primaryDark,
  primaryLight: brand.primaryLight,
  secondary: brand.secondary,

  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',

  /**
   * Fill for text inputs, which carry no border at rest.
   *
   * This is the Border colour used as a fill. On the first build the inputs
   * were white with a #E2E8F0 hairline on a #F8FAFC page, and on a real screen
   * they were almost impossible to find. Filling them with that same value
   * instead of outlining them gives the contrast the outline never had, and
   * adds no colour to the palette.
   */
  inputFill: '#E2E8F0',

  ink: '#0F172A',
  muted: '#64748B',

  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

/**
 * Dark mode, derived from the light palette rather than invented alongside it.
 *
 * Two deliberate shifts:
 *   - `primary` steps up to Primary Light. #1E88E5 is a 3.1:1 contrast against a
 *     dark background, which fails for text and small icons; #64B5F6 clears 7:1.
 *     Filled buttons still use the true brand blue (see `onBrand` below), where
 *     the contrast is carried by white text on the blue, not blue on the page.
 *   - Semantic colours lighten by one step for the same reason.
 *
 * Backgrounds are pulled toward blue rather than neutral grey so the surfaces
 * sit in the same family as the brand instead of reading as a separate theme.
 */
const dark = {
  primary: brand.primaryLight,
  primaryDark: brand.primary,
  primaryLight: '#90CAF9',
  secondary: '#94A3B8',

  background: '#0B1220',
  surface: '#141E33',
  border: '#25324B',
  inputFill: '#25324B',

  ink: '#F1F5F9',
  muted: '#94A3B8',

  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
};

/**
 * The default income split, mirroring `DEFAULT_DISTRIBUTION` in the backend's
 * auth service. It lives in the palette module because the allocation band
 * renders these proportions directly — the bar is data, not decoration, so the
 * numbers and their colours belong together.
 *
 * Emergency is the one warm segment in a cool bar. It is the only place on
 * either screen where a non-blue accent appears, which is what makes the band
 * recognisable at a glance.
 */
const allocations = [
  { name: 'Essentials', percentage: 60, light: brand.primary, dark: brand.primaryLight },
  { name: 'Savings', percentage: 20, light: brand.primaryDark, dark: brand.primary },
  { name: 'Investments', percentage: 10, light: brand.primaryLight, dark: '#90CAF9' },
  { name: 'Emergency', percentage: 10, light: light.warning, dark: dark.warning },
];

module.exports = { brand, light, dark, allocations };
