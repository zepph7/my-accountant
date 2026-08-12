import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * A horizontal row of choices, one selected.
 *
 * Used wherever the option set is short and worth seeing at a glance — wallet,
 * report granularity, a category filter. A picker would hide those behind a tap
 * and a modal for no gain.
 */
export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  scrollable = false,
}: {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Announced to screen readers as the name of the group. */
  label: string;
  scrollable?: boolean;
}) {
  const { colors } = useThemeColors();

  const chips = options.map((option) => {
    const active = option.value === value;
    return (
      <Pressable
        key={option.value}
        onPress={() => onChange(option.value)}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={option.label}
        className="mr-2 rounded-full px-4 py-2.5"
        style={({ pressed }) => ({
          backgroundColor: active ? colors.brandFill : colors.inputFill,
          opacity: pressed ? 0.75 : 1,
        })}>
        <Text
          style={[
            Type.link,
            { color: active ? colors.onBrandFill : colors.muted, fontSize: 13 },
          ]}>
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        contentContainerClassName="pr-4">
        {chips}
      </ScrollView>
    );
  }

  return (
    <View className="flex-row flex-wrap" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {chips}
    </View>
  );
}
