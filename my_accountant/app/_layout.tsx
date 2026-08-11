import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import '../global.css';
import { Colors } from '@/constants/colors';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { AuthProvider, useAuth } from '@/providers/auth-provider';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Held until the stored session has been read, so the app never flashes the
// sign-in screen at someone who is already signed in.
void SplashScreen.preventAutoHideAsync();

/**
 * Navigation themes carrying the app palette.
 *
 * Without these the navigator paints React Navigation's own background between
 * screens, which flashes white behind a dark screen during every transition.
 */
const navigationTheme = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.primary,
      background: Colors.light.background,
      card: Colors.light.surface,
      text: Colors.light.ink,
      border: Colors.light.border,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.primary,
      background: Colors.dark.background,
      card: Colors.dark.surface,
      text: Colors.dark.ink,
      border: Colors.dark.border,
    },
  },
};

/**
 * Keeps the route in agreement with the session.
 *
 * This lives below the provider so it can read auth state, and it redirects
 * rather than conditionally rendering a different navigator — swapping
 * navigators mid-session unmounts every screen and loses the back stack.
 */
function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (status === 'authenticated' && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [status, segments, router]);

  return null;
}

function RootNavigator() {
  const { colors, scheme } = useThemeColors();
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={navigationTheme[scheme]}>
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="income" />
        <Stack.Screen name="expense" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
