import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * The frame both auth screens share: a centred brand mark, a heading, and the
 * form beneath it.
 *
 * The mark is a pie chart rather than the padlock these screens usually carry.
 * A padlock says "this is a login", which the user already knows; a divided
 * circle says what the product does with the money once they are in.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background dark:bg-night-background">
      <KeyboardAvoidingView
        className="flex-1"
        // On Android the window already resizes for the keyboard, and adding
        // padding on top of that pushes the form off the screen.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pb-8"
          contentContainerStyle={{ paddingTop: insets.top + 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          <View className="items-center pb-8">
            <View
              className="mb-6 items-center justify-center"
              style={{
                width: 72,
                height: 72,
                borderRadius: RADIUS * 2.75,
                backgroundColor: colors.brandFill,
                // The glow reads as depth on the dark scheme and as a soft
                // drop shadow on the light one; both come from the same brand
                // colour, so the mark never looks pasted on.
                shadowColor: colors.brandFill,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 18,
                elevation: 10,
              }}>
              <Ionicons name="pie-chart" size={34} color={colors.onBrandFill} />
            </View>

            <Text
              accessibilityRole="header"
              style={[Type.display, { color: colors.ink, textAlign: 'center' }]}>
              {title}
            </Text>
            <Text
              style={[Type.body, { color: colors.muted, textAlign: 'center', marginTop: 8 }]}>
              {subtitle}
            </Text>
          </View>

          {children}

          <View style={{ height: insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
