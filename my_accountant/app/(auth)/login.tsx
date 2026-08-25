import { useRef, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';

import { AuthShell } from '@/components/auth/auth-shell';
import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleMark } from '@/components/ui/google-mark';
import { OrDivider } from '@/components/ui/or-divider';
import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useAuth } from '@/providers/auth-provider';
import { ApiError } from '@/lib/api';
import {
  identifierCredential,
  identifierKind,
  validateIdentifier,
  type FieldErrors,
} from '@/lib/auth-validation';

/**
 * Sign in.
 *
 * One field takes either identifier. The API still needs to be told which it
 * is — it accepts an email or a phone and refuses both — so the kind is
 * inferred from the first character: a leading `+` or digit can only be a phone
 * number. That keeps the decision off the user, who knows what they typed and
 * should not have to tell the form twice.
 *
 * The cost of dropping the tabs is the keyboard: a combined field cannot open a
 * numeric keypad, because it has to accept letters too. `email-address` is the
 * closest fit — it keeps `@` and `.` reachable and, unlike `default`, does not
 * autocapitalise.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { signInWithPassword, signInWithGoogle } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [remember, setRemember] = useState(true);

  const passwordRef = useRef<TextInput>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<'credentials' | 'google' | null>(null);

  const clear = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: '' } : current));

  const submit = async () => {
    if (pending) return;

    const next: FieldErrors = {};
    const identifierError = validateIdentifier(identifier);
    if (identifierError) next.identifier = identifierError;
    // No strength rules on sign-in. The account's password was accepted when it
    // was set, and re-judging it here would lock out anyone whose password
    // predates a rule change.
    if (!password) next.password = 'Enter your password.';

    setNotice(null);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending('credentials');
    try {
      await signInWithPassword({ ...identifierCredential(identifier), password }, remember);
      router.replace('/(tabs)');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        // The banner is suppressed only when a message is already visible beside
        // an input. Without this check, an error against a field this screen
        // does not render would be stored and shown nowhere.
        const shown = Object.keys(error.fieldErrors).filter(
          (f) => f === 'identifier' || f === 'password'
        );
        if (shown.length === 0) setNotice(error.message);
      } else {
        setNotice('Something went wrong signing you in. Try again.');
      }
    } finally {
      setPending(null);
    }
  };

  const withGoogle = async () => {
    if (pending) return;
    setNotice(null);
    setErrors({});
    setPending('google');
    try {
      // False means the user backed out of the consent screen. Nothing failed,
      // so nothing is reported.
      if (await signInWithGoogle(remember)) router.replace('/(tabs)');
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Google sign-in failed. Try again.');
    } finally {
      setPending(null);
    }
  };

  const supportUrl = process.env.EXPO_PUBLIC_SUPPORT_URL;

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your account">
      <TextField
        label="Email or phone number"
        // The icon follows what is being typed, so the field confirms how the
        // input was read before the user commits to submitting it.
        icon={identifierKind(identifier) === 'phone' ? 'call-outline' : 'mail-outline'}
        value={identifier}
        onChangeText={(v) => {
          setIdentifier(v);
          clear('identifier');
        }}
        placeholder="you@example.com or +255712345678"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        // `username` rather than `email`: the field accepts either, and telling
        // the platform it is an email suppresses phone-number suggestions.
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!pending}
        error={errors.identifier}
        hint="Sign in with whichever you registered with."
      />

      <TextField
        ref={passwordRef}
        label="Password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          clear('password');
        }}
        placeholder="Enter your password"
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!pending}
        error={errors.password}
        action={{ label: revealed ? 'Hide' : 'Show', onPress: () => setRevealed((v) => !v) }}
      />

      {notice ? <AuthNotice message={notice} /> : null}

      <View className="mb-6 mt-1 flex-row items-center justify-between">
        <Checkbox
          checked={remember}
          onChange={setRemember}
          label="Keep me signed in"
          disabled={pending !== null}
        />

        {/*
          Rendered only when a support address is configured. There is no
          password-reset endpoint yet, and a link that goes nowhere is worse
          than an absent one.
        */}
        {supportUrl ? (
          <Pressable
            onPress={() => void Linking.openURL(supportUrl)}
            accessibilityRole="link"
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[Type.link, { color: colors.primary, fontSize: 13 }]}>
              Forgot password?
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ActionButton
        label="Sign in"
        pendingLabel="Signing in…"
        arrow
        onPress={submit}
        pending={pending === 'credentials'}
        disabled={pending === 'google'}
      />

      <View className="my-7">
        <OrDivider label="or continue with" />
      </View>

      <ActionButton
        label="Continue with Google"
        pendingLabel="Opening Google…"
        variant="outline"
        icon={<GoogleMark />}
        onPress={withGoogle}
        pending={pending === 'google'}
        disabled={pending === 'credentials'}
      />

      <View className="mt-8 flex-row items-center justify-center">
        <Text style={[Type.caption, { color: colors.muted }]}>Don&apos;t have an account? </Text>
        <Pressable
          onPress={() => router.push('/(auth)/register')}
          accessibilityRole="link"
          accessibilityLabel="Create an account"
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={[Type.link, { color: colors.primary, fontSize: 13 }]}>Sign up</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
