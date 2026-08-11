import { Text, View } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** Separates the credential form from the providers below it. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  const { colors } = useThemeColors();

  return (
    <View
      className="flex-row items-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View className="flex-1" style={{ height: 1, backgroundColor: colors.border }} />
      <Text style={[Type.caption, { color: colors.muted, marginHorizontal: 14 }]}>{label}</Text>
      <View className="flex-1" style={{ height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
