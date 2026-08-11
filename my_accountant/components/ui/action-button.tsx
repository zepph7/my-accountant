import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BUTTON_HEIGHT, RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * The buttons are React Native views, not `@expo/ui` ones.
 *
 * An earlier build used `@expo/ui`'s `Button` with a `seedColor` on the host
 * and a `backgroundColor` in its style. On Android that painted the surface
 * twice — Compose drew its Material 3 filled container from the seed, and the
 * style painted a second background over it, which showed on device as a bright
 * ring around a muddy fill. Only one of the two can own the colour, and React
 * Native owns it here: the brand fill lands on the exact hex instead of a tonal
 * approximation, and a spinner can sit inside the button, which `@expo/ui`'s
 * label-only API does not allow.
 */
interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  /** Shows a spinner, swaps the label, and blocks further presses. */
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  /** Rendered before the label — a provider mark on the social buttons. */
  icon?: ReactNode;
  /** Trailing chevron on the primary action, indicating it moves you forward. */
  arrow?: boolean;
}

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  pending = false,
  pendingLabel,
  disabled = false,
  icon,
  arrow = false,
}: ActionButtonProps) {
  const { colors } = useThemeColors();
  const isPrimary = variant === 'primary';
  const inert = disabled || pending;
  const foreground = isPrimary ? colors.onBrandFill : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={pending ? (pendingLabel ?? label) : label}
      accessibilityState={{ disabled: inert, busy: pending }}
      style={({ pressed }) => ({
        height: BUTTON_HEIGHT,
        borderRadius: RADIUS * 2,
        backgroundColor: isPrimary ? colors.brandFill : colors.surface,
        borderWidth: isPrimary ? 0 : 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        // Dimmed while inert so a blocked button reads as unavailable rather
        // than as one that ignored the tap.
        opacity: inert ? 0.6 : 1,
        transform: [{ scale: pressed && !inert ? 0.985 : 1 }],
        ...(isPrimary
          ? {
              shadowColor: colors.brandFill,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 14,
              elevation: 8,
            }
          : {}),
      })}>
      {pending ? (
        <ActivityIndicator size="small" color={foreground} style={{ marginRight: 10 }} />
      ) : icon ? (
        <View className="mr-3">{icon}</View>
      ) : null}

      <Text style={[Type.action, { color: foreground }]}>
        {pending ? (pendingLabel ?? label) : label}
      </Text>

      {arrow && !pending ? (
        <View className="absolute right-5">
          <Ionicons name="arrow-forward" size={20} color={foreground} />
        </View>
      ) : null}
    </Pressable>
  );
}
