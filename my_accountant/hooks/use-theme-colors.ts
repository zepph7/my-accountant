import { Colors, type ColorSchemeName, type ThemeColors } from '@/constants/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The active colour set, plus the scheme name itself.
 *
 * The scheme is returned alongside the colours because `@expo/ui`'s `Host`
 * takes it directly: passing it forces the native subtree to the same
 * appearance as the React Native tree, instead of letting SwiftUI and Compose
 * resolve the system appearance independently and drift on the frame where the
 * user flips their device theme.
 */
export function useThemeColors(): { colors: ThemeColors; scheme: ColorSchemeName } {
  // Narrowed rather than passed through: the web implementation of
  // `useColorScheme` returns null until hydration, which would index the
  // colour map with a missing key.
  const scheme: ColorSchemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { colors: Colors[scheme], scheme };
}
