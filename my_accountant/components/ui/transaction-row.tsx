import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { money } from '@/lib/format';
import { WALLET_LABELS, type Wallet } from '@/lib/endpoints';

const WALLET_ICON: Record<Wallet, keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  account: 'business-outline',
  mpesa: 'phone-portrait-outline',
};

/**
 * One income or expense in a list.
 *
 * Direction is carried by an arrow and by the sign on the amount, not by colour
 * alone — red and green are the two hues most commonly confused, and this is a
 * screen where mistaking money in for money out matters.
 */
export function TransactionRow({
  direction,
  title,
  subtitle,
  amount,
  date,
  wallet,
  onPress,
}: {
  direction: 'in' | 'out';
  title: string;
  subtitle?: string | null;
  amount: string;
  date: string;
  wallet: Wallet;
  onPress?: () => void;
}) {
  const { colors } = useThemeColors();
  const incoming = direction === 'in';
  const tint = incoming ? colors.success : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${incoming ? 'received' : 'spent'} ${money(amount)}, ${date}, ${WALLET_LABELS[wallet]}`}
      className="flex-row items-center py-3.5"
      style={({ pressed }) => ({ opacity: pressed && onPress ? 0.6 : 1 })}>
      <View
        className="mr-3.5 h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.inputFill }}>
        <Ionicons
          name={incoming ? 'arrow-down' : 'arrow-up'}
          size={17}
          color={incoming ? colors.success : colors.muted}
        />
      </View>

      <View className="flex-1 pr-3">
        <Text style={[Type.body, { color: colors.ink, fontWeight: '600' }]} numberOfLines={1}>
          {title}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          <Ionicons name={WALLET_ICON[wallet]} size={11} color={colors.muted} />
          <Text style={[Type.caption, { color: colors.muted, marginLeft: 5 }]} numberOfLines={1}>
            {subtitle ? `${subtitle} · ${date}` : date}
          </Text>
        </View>
      </View>

      <Text style={[Type.body, { color: tint, fontWeight: '700' }]}>
        {incoming ? '+' : '−'}
        {money(amount)}
      </Text>
    </Pressable>
  );
}
