import { Alert, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card, SectionHeader } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { initials } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

/** Everything that changes how the app behaves, plus the way out. */
export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { user, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need your password or Google account to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen title="Settings">
      <Pressable
        onPress={() => router.push('/settings/profile')}
        accessibilityRole="button"
        accessibilityLabel="Edit your profile"
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
        <Card>
          <View className="flex-row items-center">
            <View
              className="mr-4 h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.brandFill }}>
              <Text style={[Type.section, { color: colors.onBrandFill, fontSize: 18 }]}>
                {user ? initials(user.firstName, user.lastName) : '?'}
              </Text>
            </View>
            <View className="flex-1">
              <Text style={[Type.section, { color: colors.ink }]}>
                {user ? `${user.firstName} ${user.lastName}` : 'Your profile'}
              </Text>
              <Text style={[Type.caption, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
                {user?.email}
              </Text>
              {user && !user.phone ? (
                <Text style={[Type.caption, { color: colors.warning, marginTop: 4 }]}>
                  No phone number on this account
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </View>
        </Card>
      </Pressable>

      <SectionHeader title="How income is split" />
      <Card>
        <Row
          icon="pie-chart-outline"
          label="Distribution categories"
          note="The percentages every income is divided by"
          onPress={() => router.push('/settings/distribution')}
        />
      </Card>

      <SectionHeader title="Your lists" />
      <Card>
        <Row
          icon="briefcase-outline"
          label="Income sources"
          note="Salary, clients, side work"
          onPress={() => router.push('/settings/sources')}
        />
        <Row
          icon="pricetag-outline"
          label="Expense categories"
          note="What the spending breakdown groups by"
          onPress={() => router.push('/settings/categories')}
          divided
        />
        <Row
          icon="calculator-outline"
          label="Wallet balances"
          note="Record a count to reconcile against"
          onPress={() => router.push('/settings/balances')}
          divided
        />
      </Card>

      <View className="mt-8">
        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          className="items-center py-4"
          style={({ pressed }) => ({
            borderRadius: RADIUS * 2,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Text style={[Type.action, { color: colors.error }]}>Sign out</Text>
        </Pressable>
      </View>

      {user ? (
        <Text
          style={[Type.caption, { color: colors.muted, textAlign: 'center', marginTop: 20 }]}>
          {`Reports are bucketed in ${user.timezone}`}
        </Text>
      ) : null}
    </Screen>
  );
}

function Row({
  icon,
  label,
  note,
  onPress,
  divided = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  note: string;
  onPress: () => void;
  divided?: boolean;
}) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${note}`}
      className="flex-row items-center py-3.5"
      style={({ pressed }) => ({
        opacity: pressed ? 0.6 : 1,
        ...(divided ? { borderTopWidth: 1, borderTopColor: colors.border } : {}),
      })}>
      <View
        className="mr-3.5 h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.inputFill }}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text style={[Type.body, { color: colors.ink, fontWeight: '600' }]}>{label}</Text>
        <Text style={[Type.caption, { color: colors.muted, marginTop: 1 }]}>{note}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}
