import palette from './palette';

/**
 * Typed access to the palette for anything that needs a colour in JavaScript
 * rather than a class name — chiefly `@expo/ui`, whose native components take
 * hex strings through `style`, `textStyle` and `seedColor` and never see
 * NativeWind.
 *
 * NativeWind covers layout and spacing; this covers colour inside the native
 * host. Both read `constants/palette.js`, so they cannot drift apart.
 */

export type ColorSchemeName = 'light' | 'dark';

/** A resolved colour set for one scheme. Both schemes carry identical keys. */
export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  background: string;
  surface: string;
  border: string;
  /** Fill for text inputs, which carry no visible border at rest. */
  inputFill: string;
  ink: string;
  muted: string;
  success: string;
  warning: string;
  error: string;
  /**
   * Fill for the primary action. Held at the true brand blue in both schemes:
   * a filled button carries its contrast through white text on blue, so it has
   * no reason to shift with the surface behind it.
   */
  brandFill: string;
  /** Text and icons sitting on `brandFill`. */
  onBrandFill: string;
  /** A tinted wash of the brand, for quiet emphasis behind small elements. */
  brandWash: string;
}

export const Colors: Record<ColorSchemeName, ThemeColors> = {
  light: {
    ...palette.light,
    brandFill: palette.brand.primary,
    onBrandFill: '#FFFFFF',
    brandWash: '#EFF6FE',
  },
  dark: {
    ...palette.dark,
    brandFill: palette.brand.primary,
    onBrandFill: '#FFFFFF',
    brandWash: '#17263D',
  },
};

/** Brand colours, identical in both schemes. */
export const Brand = palette.brand;

/**
 * The default income split. `percentage` values sum to 100 and are used as flex
 * weights by the allocation band, so the bar is always a true picture of the
 * split rather than an approximation of it.
 */
export interface Allocation {
  name: string;
  percentage: number;
  light: string;
  dark: string;
}

export const ALLOCATIONS: readonly Allocation[] = palette.allocations;

/** Resolves an allocation's colour for the active scheme. */
export const allocationColor = (allocation: Allocation, scheme: ColorSchemeName): string =>
  scheme === 'dark' ? allocation.dark : allocation.light;
