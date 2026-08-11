import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError } from '@/lib/api';
import { createOverview, listOverviews, WALLET_LABELS } from '@/lib/endpoints';
import { CURRENCY, dateTime, money } from '@/lib/format';
import { normalizeAmount, validateBalance } from '@/lib/money-validation';

/**
 * Record what each wallet actually holds, right now.
 *
 * Balances shown elsewhere in the app are derived: the most recent count here,
 * plus every income and expense recorded since. That is why this screen adds a
 * snapshot rather than editing one — a count is a fact about a moment, and
 * rewriting yesterday's count would silently move every balance after it.
 */
export default function BalancesScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const fetcher = useCallback(() => listOverviews(), []);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  const [cash, setCash] = useState('');
  const [account, setAccount] = useState('');
  const [mpesa, setMpesa] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;

    const next: Record<string, string> = {};
    const cashError = validateBalance(cash);
    if (cashError) next.cashWallet = cashError;
    const accountError = validateBalance(account);
    if (accountError) next.accountBalance = accountError;
    const mpesaError = validateBalance(mpesa);
    if (mpesaError) next.mpesaBalance = mpesaError;

    setNotice(null);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      await createOverview({
        cashWallet: normalizeAmount(cash),
        accountBalance: normalizeAmount(account),
        mpesaBalance: normalizeAmount(mpesa),
      });
      setCash('');
      setAccount('');
      setMpesa('');
      reload();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setErrors(cause.fieldErrors);
        if (Object.keys(cause.fieldErrors).length === 0) setNotice(cause.message);
      } else {
        setNotice('Could not save this count. Try again.');
      }
    } finally {
      setPending(false);
    }
  };

  const history = data?.data ?? [];

  return (
    <Screen
      title="Wallet balances"
      subtitle="Count what you hold to reconcile against"
      back
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      <Card>
        <Text style={[Type.caption, { color: colors.muted, marginBottom: 16 }]}>
          Enter what each wallet holds right now. Everything you record afterwards is applied on
          top, so the balances on your dashboard stay in step with your transactions.
        </Text>

        <TextField
          label={`${WALLET_LABELS.cash} (${CURRENCY})`}
          icon="cash-outline"
          value={cash}
          onChangeText={setCash}
          placeholder="0.00"
          keyboardType="decimal-pad"
          editable={!pending}
          error={errors.cashWallet}
        />
        <TextField
          label={`${WALLET_LABELS.account} (${CURRENCY})`}
          icon="business-outline"
          value={account}
          onChangeText={setAccount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          editable={!pending}
          error={errors.accountBalance}
        />
        <TextField
          label={`${WALLET_LABELS.mpesa} (${CURRENCY})`}
          icon="phone-portrait-outline"
          value={mpesa}
          onChangeText={setMpesa}
          placeholder="0.00"
          keyboardType="decimal-pad"
          editable={!pending}
          error={errors.mpesaBalance}
        />

        {notice ? <AuthNotice message={notice} /> : null}

        <ActionButton
          label="Save this count"
          pendingLabel="Saving…"
          onPress={submit}
          pending={pending}
        />
      </Card>

      <SectionHeader title="Previous counts" />
      <Card>
        {history.length === 0 ? (
          <Text style={[Type.caption, { color: colors.muted }]}>
            No counts recorded yet. Until you take one, balances start from zero and only reflect
            what you have recorded in the app.
          </Text>
        ) : (
          history.map((snapshot, index) => (
            <View
              key={snapshot.id}
              className="py-3"
              style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
              <View className="flex-row items-center">
                <Text style={[Type.body, { color: colors.ink, flex: 1, fontWeight: '600' }]}>
                  {dateTime(snapshot.created_at)}
                </Text>
                <Text style={[Type.body, { color: colors.ink, fontWeight: '700' }]}>
                  {money(
                    String(
                      Number(snapshot.cash_wallet) +
                        Number(snapshot.account_balance) +
                        Number(snapshot.mpesa_balance)
                    )
                  )}
                </Text>
              </View>
              <Text style={[Type.caption, { color: colors.muted, marginTop: 2 }]}>
                {`${WALLET_LABELS.cash} ${money(snapshot.cash_wallet)} · ${WALLET_LABELS.account} ${money(
                  snapshot.account_balance
                )} · ${WALLET_LABELS.mpesa} ${money(snapshot.mpesa_balance)}`}
              </Text>
            </View>
          ))
        )}
      </Card>

      <View className="mt-6">
        <ActionButton label="Done" variant="outline" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
