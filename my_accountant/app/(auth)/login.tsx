import { useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthShell } from '@/components/auth/auth-shell';
import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleMark } from '@/components/ui/google-mark';
import { OrDivider } from '@/components/ui/or-divider';
import { SegmentedTabs, type TabOption } from '@/components/ui/segmented-tabs';
import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useAuth } from '@/providers/auth-provider';
import { ApiError } from '@/lib/api';
import { normalizePhone, validateEmail, validatePhone, type FieldErrors } from '@/lib/auth-validation';

type Method = 'email' | 'phone';

const METHODS: readonly TabOption<Method>[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

/**
 * Sign in.
 *
 * The method is chosen with a tab rather than inferred from what was typed. The
 * API takes an email or a phone number and refuses both together, so the client
 * has to pick one — and picking it up front is what lets the field show a
 * numeric keypad to someone entering a phone number and offer the right
 * autofill, neither of which a combined field can do.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { signInWithPassword, signInWithGoogle } = useAuth();

  const [method, setMethod] = useState<Method>('email');
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

  /** Switching method clears the field, so an email is never sent as a phone. */
  const changeMethod = (next: Method) => {
    setMethod(next);
    setIdentifier('');
    setErrors({});
    setNotice(null);
  };

  const submit = async () => {
    if (pending) return;

    const next: FieldErrors = {};
    const identifierError =
      method === 'email' ? validateEmail(identifier) : validatePhone(identifier);
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
      await signInWithPassword(
        method === 'email'
          ? { email: identifier.trim(), password }
          : { phone: normalizePhone(identifier), password },
        remember
      );
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
      <View className="mb-6">
        <SegmentedTabs options={METHODS} value={method} onChange={changeMethod} />
      </View>

      {method === 'email' ? (
        <TextField
          label="Email address"
          icon="mail-outline"
          value={identifier}
          onChangeText={(v) => {
            setIdentifier(v);
            clear('identifier');
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!pending}
          error={errors.identifier}
        />
      ) : (
        <TextField
          label="Phone number"
          icon="call-outline"
          value={identifier}
          onChangeText={(v) => {
            setIdentifier(v);
            clear('identifier');
          }}
          placeholder="+254 712 345 678"
          keyboardType="phone-pad"
          autoComplete="tel"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!pending}
          error={errors.identifier}
        />
      )}

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
