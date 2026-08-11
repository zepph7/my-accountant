import { Text, View } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Whatever the server said, shown above the form.
 *
 * Used for failures that belong to the request rather than to one input — a
 * rejected password, an unreachable server. Anything the API attributes to a
 * field is shown under that field instead, where the fix is.
 *
 * Outlined rather than filled: the palette has one red, and a red fill behind
 * red text either loses contrast or needs a tint that is not in the palette.
 */
export function AuthNotice({ message }: { message: string }) {
  const { colors } = useThemeColors();

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="mb-6 rounded-xl px-4 py-3"
      style={{ borderWidth: 1, borderColor: colors.error }}>
      <Text style={[Type.caption, { color: colors.error }]}>{message}</Text>
    </View>
  );
}
