import { Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Underlined tabs above a form, the way exchange apps switch a sign-in between
 * an email address and a phone number.
 *
 * This replaces the single combined "Email or phone" field of the first build.
 * That field could only guess at what was being typed, so it showed an email
 * keyboard to anyone entering a phone number — no numeric pad, `+` behind a
 * modifier key — and offered the wrong autofill. Asking which one up front is
 * one tap and makes both the keyboard and the request body correct.
 */
export interface TabOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { colors } = useThemeColors();

  return (
    <View className="flex-row" accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="mr-7 pb-2.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text
              style={[
                Type.action,
                { color: active ? colors.ink : colors.muted, fontWeight: active ? '700' : '500' },
              ]}>
              {option.label}
            </Text>
            <View
              style={{
                height: 2,
                marginTop: 8,
                borderRadius: 1,
                backgroundColor: active ? colors.primary : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
