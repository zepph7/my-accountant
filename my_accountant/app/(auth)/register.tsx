import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';

import { AuthNotice } from '@/components/auth/auth-notice';
import { AuthShell } from '@/components/auth/auth-shell';
import { LegalConsent } from '@/components/auth/legal-consent';
import { ActionButton } from '@/components/ui/action-button';
import { GoogleMark } from '@/components/ui/google-mark';
import { OrDivider } from '@/components/ui/or-divider';
import { TextField } from '@/components/ui/text-field';
import { ALLOCATIONS } from '@/constants/colors';
import { RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError } from '@/lib/api';
import {
  normalizePhone,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
  type FieldErrors,
} from '@/lib/auth-validation';
import { useAuth } from '@/providers/auth-provider';

/** Fields this screen renders, for deciding where an API error goes. */
const OWN_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'password'];

/**
 * Create an account.
 *
 * Both an email and a phone number are required, matching the API. The email is
 * what Google sign-in matches on later, so an account without one could never
 * be linked and the same person would end up with two — the second owning none
 * of their financial history.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { signUpWithPassword, signInWithGoogle } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<'credentials' | 'google' | null>(null);

  const clear = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: '' } : current));

  const submit = async () => {
    if (pending) return;

    const next: FieldErrors = {};
    const first = validateName(firstName, 'first name');
    if (first) next.firstName = first;
    const last = validateName(lastName, 'last name');
    if (last) next.lastName = last;
    const mail = validateEmail(email);
    if (mail) next.email = mail;
    const tel = validatePhone(phone);
    if (tel) next.phone = tel;
    const secret = validatePassword(password);
    if (secret) next.password = secret;

    setNotice(null);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending('credentials');
    try {
      await signUpWithPassword(
        {
          email: email.trim(),
          phone: normalizePhone(phone),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          // Taken from the device rather than asked for. The API buckets the
          // daily and hourly expense reports in this zone, and the phone
          // already knows the answer.
          timezone: deviceTimezone(),
        },
        true
      );
      router.replace('/(tabs)');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        // An error against a field this screen does not render — `timezone`, or
        // a strict-mode violation reported against the root — would otherwise be
        // stored and shown nowhere, and the form would refuse to submit in silence.
        const shown = Object.keys(error.fieldErrors).filter((f) => OWN_FIELDS.includes(f));
        if (shown.length === 0) setNotice(error.message);
      } else {
        setNotice('Something went wrong creating your account. Try again.');
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
      if (await signInWithGoogle(true)) router.replace('/(tabs)');
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Google sign-up failed. Try again.');
    } finally {
      setPending(null);
    }
  };

  return (
    <AuthShell title="Create account" subtitle="Start splitting your income automatically">
      {/*
        The split, stated before the form rather than after it. It is the one
        thing a new user needs to understand about this product, and it is drawn
        from the same data the app seeds so the two cannot disagree.
      */}
      <View
        className="mb-6 p-4"
        style={{
          borderRadius: RADIUS * 2,
          backgroundColor: colors.brandWash,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
        <Text style={[Type.caption, { color: colors.muted }]}>
          Every income you record is split automatically. You can change these any time.
        </Text>
        <View className="mt-3 flex-row flex-wrap">
          {ALLOCATIONS.map((allocation) => (
            <Text
              key={allocation.name}
              style={[Type.caption, { color: colors.ink, fontWeight: '600', marginRight: 14 }]}>
              {allocation.percentage}% {allocation.name.toLowerCase()}
            </Text>
          ))}
        </View>
      </View>

      <View className="flex-row" style={{ gap: 12 }}>
        <View className="flex-1">
          <TextField
            label="First name"
            icon="person-outline"
            value={firstName}
            onChangeText={(v) => {
              setFirstName(v);
              clear('firstName');
            }}
            placeholder="Ada"
            autoCapitalize="words"
            autoComplete="given-name"
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
            editable={!pending}
            error={errors.firstName}
          />
        </View>
        <View className="flex-1">
          <TextField
            ref={lastNameRef}
            label="Last name"
            icon="person-outline"
            value={lastName}
            onChangeText={(v) => {
              setLastName(v);
              clear('lastName');
            }}
            placeholder="Lovelace"
            autoCapitalize="words"
            autoComplete="family-name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!pending}
            error={errors.lastName}
          />
        </View>
      </View>

      <TextField
        ref={emailRef}
        label="Email address"
        icon="mail-outline"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          clear('email');
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
        editable={!pending}
        error={errors.email}
      />

      <TextField
        ref={phoneRef}
        label="Phone number"
        icon="call-outline"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          clear('phone');
        }}
        placeholder="+254 712 345 678"
        keyboardType="phone-pad"
        autoComplete="tel"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!pending}
        hint="Start with your country code."
        error={errors.phone}
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
        placeholder="Choose a password"
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!pending}
        hint="At least 10 characters, with a capital letter and a number."
        error={errors.password}
        action={{ label: revealed ? 'Hide' : 'Show', onPress: () => setRevealed((v) => !v) }}
      />

      {notice ? <AuthNotice message={notice} /> : null}

      <View className="mt-2">
        <ActionButton
          label="Create account"
          pendingLabel="Creating account…"
          arrow
          onPress={submit}
          pending={pending === 'credentials'}
          disabled={pending === 'google'}
        />
      </View>

      <View className="mt-4">
        <LegalConsent />
      </View>

      <View className="my-7">
        <OrDivider label="or continue with" />
      </View>

      <ActionButton
        label="Sign up with Google"
        pendingLabel="Opening Google…"
        variant="outline"
        icon={<GoogleMark />}
        onPress={withGoogle}
        pending={pending === 'google'}
        disabled={pending === 'credentials'}
      />

      <View className="mt-8 flex-row items-center justify-center">
        <Text style={[Type.caption, { color: colors.muted }]}>Already have an account? </Text>
        <Pressable
          onPress={() => router.push('/(auth)/login')}
          accessibilityRole="link"
          accessibilityLabel="Sign in"
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={[Type.link, { color: colors.primary, fontSize: 13 }]}>Sign in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

/**
 * The device's IANA zone, or UTC where the runtime will not say. The API rejects
 * anything that is not a known zone name, so a bad guess would fail registration
 * outright — UTC is the value the server defaults to anyway.
 */
const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
