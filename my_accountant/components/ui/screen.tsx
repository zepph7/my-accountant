import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * The page frame every signed-in screen uses: safe area, a title row, and a
 * scroll view wired to pull-to-refresh.
 *
 * Loading and error are handled here rather than in each screen, so a failed
 * request always looks the same and always offers the same way out.
 */
interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Shows a back chevron. Set on anything pushed on top of a tab. */
  back?: boolean;
  /** Rendered at the trailing edge of the title row. */
  action?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Turns off the scroll view, for screens that own their own list. */
  scroll?: boolean;
  children: ReactNode;
}

export function Screen({
  title,
  subtitle,
  back = false,
  action,
  loading = false,
  error = null,
  onRetry,
  refreshing = false,
  onRefresh,
  scroll = true,
  children,
}: ScreenProps) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const header = (
    <View className="px-6 pb-5" style={{ paddingTop: insets.top + 12 }}>
      {back ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          className="mb-4 h-9 w-9 items-center justify-center rounded-full"
          style={({ pressed }) => ({
            backgroundColor: colors.inputFill,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
      ) : null}

      <View className="flex-row items-center">
        <View className="flex-1">
          <Text accessibilityRole="header" style={[Type.title, { color: colors.ink }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[Type.caption, { color: colors.muted, marginTop: 4 }]}>{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
    </View>
  );

  let body: ReactNode = children;

  if (loading) {
    body = (
      <View className="items-center py-20">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (error) {
    body = (
      <View className="items-center px-6 py-16">
        <Ionicons name="cloud-offline-outline" size={34} color={colors.muted} />
        <Text
          style={[Type.body, { color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
          {error}
        </Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            hitSlop={10}
            className="mt-5 rounded-lg px-5 py-3"
            style={({ pressed }) => ({
              backgroundColor: colors.inputFill,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={[Type.action, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-night-background">
      {header}

      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }>
          {body}
          <View style={{ height: insets.bottom }} />
        </ScrollView>
      ) : (
        <View className="flex-1">{body}</View>
      )}
    </View>
  );
}
