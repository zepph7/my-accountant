import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card, EmptyState, SectionHeader } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SplitBar } from '@/components/ui/split-bar';
import { TransactionRow } from '@/components/ui/transaction-row';
import { RADIUS, Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getDashboard, WALLET_LABELS, type Wallet } from '@/lib/endpoints';
import { CURRENCY, longDate, money, percent, shortDate } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

const WALLET_ICON: Record<Wallet, keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  account: 'business-outline',
  mpesa: 'phone-portrait-outline',
};

/**
 * Where you stand, right now.
 *
 * Ordered by how often a question gets asked: what have I got, what happened
 * this month, where did the income go, what did I record last. Anything the
 * user has to act on — a distribution that does not total 100% — is raised
 * above all of it, because a silent misconfiguration quietly mis-splits every
 * income recorded after it.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { user } = useAuth();

  const fetcher = useCallback(() => getDashboard(), []);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  return (
    <Screen
      title={user ? `Hi, ${user.firstName}` : 'Home'}
      subtitle={data ? `${longDate(data.currentMonth.range.from)} — today` : undefined}
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      {data ? (
        <>
          {/* Total across every wallet, derived from the last counted snapshot
              plus everything recorded since. */}
          <View
            className="p-6"
            style={{
              borderRadius: RADIUS * 2.5,
              backgroundColor: colors.brandFill,
              shadowColor: colors.brandFill,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.28,
              shadowRadius: 16,
              elevation: 8,
            }}>
            <Text style={[Type.caption, { color: colors.onBrandFill, opacity: 0.85 }]}>
              Total balance
            </Text>
            <Text style={[Type.display, { color: colors.onBrandFill, marginTop: 6 }]}>
              {money(data.balances.total)}
            </Text>
            <Text style={[Type.caption, { color: colors.onBrandFill, opacity: 0.85, marginTop: 2 }]}>
              {CURRENCY}
              {data.balances.asOf ? ` · counted ${shortDate(data.balances.asOf)}` : ' · no count yet'}
            </Text>
          </View>

          <View className="mt-4 flex-row" style={{ gap: 12 }}>
            <QuickAction
              icon="add-circle-outline"
              label="Add income"
              onPress={() => router.push('/income/new')}
            />
            <QuickAction
              icon="remove-circle-outline"
              label="Add expense"
              onPress={() => router.push('/expense/new')}
            />
          </View>

          {data.distributionSetup.warning ? (
            <Pressable
              onPress={() => router.push('/settings/distribution')}
              accessibilityRole="button"
              className="mt-5 flex-row items-center p-4"
              style={({ pressed }) => ({
                borderRadius: RADIUS * 2,
                borderWidth: 1,
                borderColor: colors.warning,
                opacity: pressed ? 0.75 : 1,
              })}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
              <Text style={[Type.caption, { color: colors.ink, flex: 1, marginHorizontal: 12 }]}>
                {data.distributionSetup.warning}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null}

          <SectionHeader title="Wallets" actionLabel="Update" onAction={() => router.push('/settings/balances')} />
          <Card>
            {(['cash', 'account', 'mpesa'] as const).map((wallet, index) => (
              <View
                key={wallet}
                className="flex-row items-center py-3"
                style={
                  index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined
                }>
                <View
                  className="mr-3 h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.inputFill }}>
                  <Ionicons name={WALLET_ICON[wallet]} size={16} color={colors.primary} />
                </View>
                <Text style={[Type.body, { color: colors.ink, flex: 1 }]}>
                  {WALLET_LABELS[wallet]}
                </Text>
                <Text style={[Type.body, { color: colors.ink, fontWeight: '700' }]}>
                  {money(data.balances[wallet].balance)}
                </Text>
              </View>
            ))}
          </Card>

          <SectionHeader title="This month" />
          <View className="flex-row" style={{ gap: 12 }}>
            <Stat label="Income" value={data.currentMonth.income} tone={colors.success} />
            <Stat label="Spent" value={data.currentMonth.expenses} tone={colors.ink} />
            <Stat
              label="Net"
              value={data.currentMonth.net}
              tone={Number(data.currentMonth.net) < 0 ? colors.error : colors.primary}
            />
          </View>

          <SectionHeader
            title="Where income went"
            actionLabel="Adjust"
            onAction={() => router.push('/settings/distribution')}
          />
          <Card>
            <SplitBar
              segments={data.currentMonth.distributed.map((c) => ({
                key: c.categoryId,
                label: c.name,
                value: c.total,
                meta: percent(c.percentage),
              }))}
              emptyLabel="No income recorded this month yet."
            />
          </Card>

          <SectionHeader title="Recent" actionLabel="See all" onAction={() => router.push('/(tabs)/income')} />
          <Card>
            {data.recent.incomes.length === 0 && data.recent.expenses.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="Nothing recorded yet"
                body="Record your first income and it will be split the moment you save it."
                actionLabel="Add income"
                onAction={() => router.push('/income/new')}
              />
            ) : (
              <>
                {data.recent.incomes.map((income) => (
                  <TransactionRow
                    key={income.id}
                    direction="in"
                    title={income.source_name ?? 'Income'}
                    subtitle={income.notes}
                    amount={income.amount}
                    date={shortDate(income.date)}
                    wallet={income.wallet}
                    onPress={() => router.push(`/income/${income.id}`)}
                  />
                ))}
                {data.recent.expenses.map((expense) => (
                  <TransactionRow
                    key={expense.id}
                    direction="out"
                    title={expense.payee ?? expense.category_name ?? 'Expense'}
                    subtitle={expense.description}
                    amount={expense.amount}
                    date={shortDate(expense.occurred_at)}
                    wallet={expense.wallet}
                    onPress={() => router.push(`/expense/${expense.id}`)}
                  />
                ))}
              </>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 flex-row items-center justify-center py-4"
      style={({ pressed }) => ({
        borderRadius: RADIUS * 2,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.75 : 1,
      })}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[Type.link, { color: colors.ink, marginLeft: 8 }]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const { colors } = useThemeColors();

  return (
    <View
      className="flex-1 p-4"
      style={{
        borderRadius: RADIUS * 2,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <Text style={[Type.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[Type.body, { color: tone, fontWeight: '700', marginTop: 4 }]} numberOfLines={1}>
        {money(value)}
      </Text>
    </View>
  );
}
