import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * A text input with a leading icon and an optional trailing action.
 *
 * This is a React Native `TextInput`, not `@expo/ui`'s. The design puts an icon
 * inside the field and a reveal control at its right edge, and `@expo/ui`'s
 * input takes no children and exposes no accessories, so that layout is not
 * expressible there. The trade is worth taking for a second reason: `@expo/ui`
 * exposes no accessibility props at all, so its fields were unlabelled to a
 * screen reader. These are labelled.
 */
export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Ionicons name shown at the leading edge. */
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
  error?: string;
  /** Small text control at the trailing edge, e.g. Show / Hide. */
  action?: { label: string; onPress: () => void };
  /** Rendered instead of the input, for fields that open a picker. */
  children?: ReactNode;
  onPressField?: () => void;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, icon, hint, error, action, children, onPressField, ...input },
  ref
) {
  const { colors } = useThemeColors();

  const box = {
    minHeight: 56,
    borderRadius: RADIUS,
    borderWidth: 1,
    // At rest the hairline matches the fill and disappears, so focus and error
    // states paint it in without the box changing size.
    borderColor: error ? colors.error : colors.inputFill,
    backgroundColor: colors.inputFill,
    paddingHorizontal: 14,
  };

  const body = (
    <View className="flex-row items-center" style={box}>
      <Ionicons name={icon} size={19} color={error ? colors.error : colors.primary} />

      <View className="ml-3 flex-1">
        {children ?? (
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={error ?? hint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={[Type.field, { color: colors.ink, paddingVertical: 16 }]}
            {...input}
          />
        )}
      </View>

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={12}
          className="pl-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={[Type.link, { color: colors.primary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View className="mb-4">
      <Text style={[Type.label, { color: colors.muted, marginBottom: 8 }]}>{label}</Text>

      {onPressField ? (
        <Pressable
          onPress={onPressField}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          {body}
        </Pressable>
      ) : (
        body
      )}

      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[Type.caption, { color: colors.error, marginTop: 6 }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[Type.caption, { color: colors.muted, marginTop: 6 }]}>{hint}</Text>
      ) : null}
    </View>
  );
});
