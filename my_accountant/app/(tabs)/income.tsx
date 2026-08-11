import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/card';
import { ChipSelect, type ChipOption } from '@/components/ui/chip-select';
import { Fab } from '@/components/ui/fab';
import { Screen } from '@/components/ui/screen';
import { TransactionRow } from '@/components/ui/transaction-row';
import { Type } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { listIncomes, WALLET_LABELS, type Wallet } from '@/lib/endpoints';
import { shortDate } from '@/lib/format';

type WalletFilter = Wallet | 'all';

const WALLET_FILTERS: readonly ChipOption<WalletFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'cash', label: WALLET_LABELS.cash },
  { value: 'account', label: WALLET_LABELS.account },
  { value: 'mpesa', label: WALLET_LABELS.mpesa },
];

/** Everything that came in, newest first. */
export default function IncomeScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const [wallet, setWallet] = useState<WalletFilter>('all');

  const fetchPage = useCallback(
    (page: number) => listIncomes({ page, limit: 20, wallet: wallet === 'all' ? undefined : wallet }),
    [wallet]
  );

  const list = usePagedList(fetchPage);

  return (
    <View className="flex-1">
      <Screen
        title="Income"
        subtitle={list.total > 0 ? `${list.total} recorded` : undefined}
        scroll={false}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}>
        <View className="px-6 pb-3">
          <ChipSelect
            options={WALLET_FILTERS}
            value={wallet}
            onChange={setWallet}
            label="Filter by wallet"
            scrollable
          />
        </View>

        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-6 pb-32"
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
              icon="arrow-down-circle-outline"
              title="No income yet"
              body="Record what comes in and it is split across your categories the moment you save it."
              actionLabel="Add income"
              onAction={() => router.push('/income/new')}
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
              direction="in"
              title={item.source_name ?? 'Income'}
              subtitle={item.notes}
              amount={item.amount}
              date={shortDate(item.date)}
              wallet={item.wallet}
              onPress={() => router.push(`/income/${item.id}`)}
            />
          )}
        />
      </Screen>

      <Fab label="Income" onPress={() => router.push('/income/new')} />
    </View>
  );
}
