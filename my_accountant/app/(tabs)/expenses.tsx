import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/card';
import { ChipSelect, type ChipOption } from '@/components/ui/chip-select';
import { Fab } from '@/components/ui/fab';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { TransactionRow } from '@/components/ui/transaction-row';
import { Type } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { listExpenses, WALLET_LABELS, type Wallet } from '@/lib/endpoints';
import { dateTime } from '@/lib/format';

type WalletFilter = Wallet | 'all';

const WALLET_FILTERS: readonly ChipOption<WalletFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'cash', label: WALLET_LABELS.cash },
  { value: 'account', label: WALLET_LABELS.account },
  { value: 'mpesa', label: WALLET_LABELS.mpesa },
];

/**
 * Everything spent, newest first.
 *
 * Search is here and not on the income list because the API only offers it
 * here — expenses carry a payee and a description worth searching, income does
 * not.
 */
export default function ExpensesScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const [wallet, setWallet] = useState<WalletFilter>('all');
  const [search, setSearch] = useState('');

  const fetchPage = useCallback(
    (page: number) =>
      listExpenses({
        page,
        limit: 20,
        wallet: wallet === 'all' ? undefined : wallet,
        // The API rejects a blank search, so an empty box means no filter.
        search: search.trim() || undefined,
      }),
    [wallet, search]
  );

  const list = usePagedList(fetchPage);

  return (
    <View className="flex-1">
      <Screen
        title="Expenses"
        subtitle={list.total > 0 ? `${list.total} recorded` : undefined}
        scroll={false}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}>
        <View className="px-6">
          <TextField
            label="Search"
            icon="search-outline"
            value={search}
            onChangeText={setSearch}
            placeholder="Payee or description"
            autoCapitalize="none"
            returnKeyType="search"
          />
          <View className="pb-3">
            <ChipSelect
              options={WALLET_FILTERS}
              value={wallet}
              onChange={setWallet}
              label="Filter by wallet"
              scrollable
            />
          </View>
        </View>

        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-6 pb-32"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={list.refreshing}
              onRefresh={list.refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={list.loadMore}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="arrow-up-circle-outline"
              title={search ? 'Nothing matched' : 'No expenses yet'}
              body={
                search
                  ? 'Try a different payee or description.'
                  : 'Record what you spend to see where the money actually goes.'
              }
              actionLabel={search ? undefined : 'Add expense'}
              onAction={search ? undefined : () => router.push('/expense/new')}
            />
          }
          ListFooterComponent={
            list.loadingMore ? (
              <View className="py-6">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : list.items.length > 0 && !list.hasMore ? (
              <Text
                style={[Type.caption, { color: colors.muted, textAlign: 'center', paddingVertical: 20 }]}>
                {`That's all ${list.total} of them.`}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TransactionRow
              direction="out"
              title={item.payee ?? item.category_name ?? 'Expense'}
              subtitle={item.description}
              amount={item.amount}
              date={dateTime(item.occurred_at)}
              wallet={item.wallet}
              onPress={() => router.push(`/expense/${item.id}`)}
            />
          )}
        />
      </Screen>

      <Fab label="Expense" onPress={() => router.push('/expense/new')} />
    </View>
  );
}
