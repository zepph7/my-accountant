import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** A labelled checkbox. The label is part of the target, not decoration next to it. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      hitSlop={8}
      className="flex-row items-center py-1"
      style={({ pressed }) => ({ opacity: pressed || disabled ? 0.6 : 1 })}>
      <View
        className="mr-2.5 items-center justify-center"
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: checked ? colors.brandFill : colors.muted,
          backgroundColor: checked ? colors.brandFill : 'transparent',
        }}>
        {checked ? <Ionicons name="checkmark" size={13} color={colors.onBrandFill} /> : null}
      </View>
      <Text style={[Type.caption, { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}
