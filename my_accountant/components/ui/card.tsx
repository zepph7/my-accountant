import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** A raised panel. Everything on a signed-in screen sits in one of these. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { colors } = useThemeColors();

  return (
    <View
      className={`p-5 ${className}`}
      style={{
        borderRadius: RADIUS * 2,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      {children}
    </View>
  );
}

/** A heading above a group, with an optional action on the right. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useThemeColors();

  return (
    <View className="mb-3 mt-7 flex-row items-center">
      <Text accessibilityRole="header" style={[Type.section, { color: colors.ink, flex: 1 }]}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={[Type.link, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Shown where a list would be, when the list is empty.
 *
 * An empty screen is an invitation to act, so this always names the action
 * rather than only reporting the absence.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useThemeColors();

  return (
    <View className="items-center px-6 py-14">
      <View
        className="mb-4 h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.inputFill }}>
        <Ionicons name={icon} size={24} color={colors.muted} />
      </View>
      <Text style={[Type.section, { color: colors.ink }]}>{title}</Text>
      <Text
        style={[Type.caption, { color: colors.muted, textAlign: 'center', marginTop: 6 }]}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          className="mt-5 rounded-lg px-5 py-3"
          style={({ pressed }) => ({
            backgroundColor: colors.brandFill,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Text style={[Type.action, { color: colors.onBrandFill }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
