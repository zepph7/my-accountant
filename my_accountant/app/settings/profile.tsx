import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError } from '@/lib/api';
import { updateProfile } from '@/lib/auth-client';
import {
  normalizePhone,
  validateName,
  validatePhone,
  type FieldErrors,
} from '@/lib/auth-validation';
import { longDate } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

/**
 * Your name, phone and timezone.
 *
 * Email is shown but not editable. It is what Google sign-in matches on and a
 * login identifier in its own right, so changing it needs proof the new address
 * belongs to you — a verification round trip the API does not have yet, and one
 * this form must not pretend to.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { user, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending || !user) return;

    const next: FieldErrors = {};
    const first = validateName(firstName, 'first name');
    if (first) next.firstName = first;
    const last = validateName(lastName, 'last name');
    if (last) next.lastName = last;
    // Optional here, unlike registration: a Google-created account has no phone
    // and must not be forced to invent one to change its name.
    if (phone.trim()) {
      const tel = validatePhone(phone);
      if (tel) next.phone = tel;
    }

    setNotice(null);
    setSaved(null);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(phone.trim() ? { phone: normalizePhone(phone) } : {}),
      });
      await refreshUser();
      setSaved('Profile updated.');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) setNotice(error.message);
      } else {
        setNotice('Could not save your profile. Try again.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen title="Profile" back>
      <TextField
        label="First name"
        icon="person-outline"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        editable={!pending}
        error={errors.firstName}
      />

      <TextField
        label="Last name"
        icon="person-outline"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        editable={!pending}
        error={errors.lastName}
      />

      <TextField
        label="Phone number"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        placeholder="+254 712 345 678"
        keyboardType="phone-pad"
        editable={!pending}
        hint="Start with your country code."
        error={errors.phone}
      />

      {notice ? <AuthNotice message={notice} /> : null}

      {saved ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[Type.caption, { color: colors.success, marginBottom: 12 }]}>
          {saved}
        </Text>
      ) : null}

      <ActionButton label="Save changes" pendingLabel="Saving…" onPress={submit} pending={pending} />

      <View className="mt-8">
        <Card>
          <Detail label="Email" value={user?.email ?? '—'} />
          <Detail
            label="Timezone"
            value={user?.timezone ?? 'UTC'}
            note="Reports are bucketed in this zone. Sign out and back in after changing it on the server."
          />
          <Detail label="Member since" value={longDate(user?.createdAt)} />
          <Text style={[Type.caption, { color: colors.muted, marginTop: 12 }]}>
            Your email cannot be changed here — it is how Google sign-in finds this account, so
            changing it needs a verification step the app does not have yet.
          </Text>
        </Card>
      </View>

      <View className="mt-6">
        <ActionButton label="Done" variant="outline" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Detail({ label, value, note }: { label: string; value: string; note?: string }) {
  const { colors } = useThemeColors();

  return (
    <View className="py-2.5">
      <Text style={[Type.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[Type.body, { color: colors.ink, marginTop: 2 }]}>{value}</Text>
      {note ? (
        <Text style={[Type.caption, { color: colors.muted, marginTop: 4 }]}>{note}</Text>
      ) : null}
    </View>
  );
}
