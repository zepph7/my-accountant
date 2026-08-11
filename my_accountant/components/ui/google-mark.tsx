import AntDesign from '@expo/vector-icons/AntDesign';

import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Google's G, monochrome.
 *
 * The four-colour mark is an image asset this project does not carry, and
 * drawing it would need `react-native-svg`, which is not installed. Google's
 * brand guidelines allow a single-colour G where the full-colour version is not
 * practical, so this uses the icon font already in the bundle.
 */
export function GoogleMark({ size = 18 }: { size?: number }) {
  const { colors } = useThemeColors();
  return <AntDesign name="google" size={size} color={colors.ink} />;
}
