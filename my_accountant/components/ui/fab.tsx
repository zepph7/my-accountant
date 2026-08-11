import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * The primary action on a list screen, floating clear of the rows.
 *
 * Offset above the tab bar rather than the raw safe-area inset, or it would sit
 * on top of the tab labels on a device with no home indicator.
 */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute right-5" style={{ bottom: insets.bottom + 24 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-row items-center px-5"
        style={({ pressed }) => ({
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.brandFill,
          shadowColor: colors.brandFill,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 10,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
        <Ionicons name="add" size={22} color={colors.onBrandFill} />
        <Text style={[Type.action, { color: colors.onBrandFill, marginLeft: 6 }]}>{label}</Text>
      </Pressable>
    </View>
  );
}
