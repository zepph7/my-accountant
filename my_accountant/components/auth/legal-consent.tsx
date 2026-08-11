import { Linking, Text } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * The consent line under the sign-up button.
 *
 * Both app stores require an account-creating screen to link its terms and
 * privacy policy, so this is not optional for release — but a link that opens
 * nothing is worse than an absent one. The URLs come from
 * `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL`, and the whole line is
 * withheld until both are set, so it can never render as dead text.
 */
export function LegalConsent() {
  const { colors } = useThemeColors();

  const terms = process.env.EXPO_PUBLIC_TERMS_URL;
  const privacy = process.env.EXPO_PUBLIC_PRIVACY_URL;

  if (!terms || !privacy) return null;

  const link = { color: colors.primary, fontWeight: '600' as const };

  return (
    <Text style={[Type.caption, { color: colors.muted, textAlign: 'center' }]}>
      By creating an account you agree to our{' '}
      <Text
        accessibilityRole="link"
        style={link}
        onPress={() => Linking.openURL(terms)}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text
        accessibilityRole="link"
        style={link}
        onPress={() => Linking.openURL(privacy)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}
