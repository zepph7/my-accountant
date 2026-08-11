import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthNotice } from '@/components/auth/auth-notice';
import { Card, SectionHeader } from '@/components/ui/card';
import { ChipSelect, type ChipOption } from '@/components/ui/chip-select';
import { DateField } from '@/components/ui/date-field';
import { ActionButton } from '@/components/ui/action-button';
import { OptionSheet } from '@/components/ui/option-sheet';
import { SplitBar } from '@/components/ui/split-bar';
import { TextField } from '@/components/ui/text-field';
import { RADIUS, Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError } from '@/lib/api';
import {
  createIncome,
  deleteIncome,
  listIncomeSources,
  updateIncome,
  WALLETS,
  WALLET_LABELS,
  type IncomeDetail,
  type Wallet,
} from '@/lib/endpoints';
import { CURRENCY, percent, today } from '@/lib/format';
import { normalizeAmount, validateAmount } from '@/lib/money-validation';

const WALLET_OPTIONS: readonly ChipOption<Wallet>[] = WALLETS.map((w) => ({
  value: w,
  label: WALLET_LABELS[w],
}));

/**
 * Record or amend an income.
 *
 * The same form serves both, because the fields are identical and the only
 * difference is which call it makes. On edit the API re-runs the distribution
 * against the current percentages, which is why the existing split is shown
 * beneath the form — changing an amount here silently rewrites those numbers,
 * and the user should be looking at them when they do.
 */
export function IncomeForm({ income }: { income?: IncomeDetail }) {
  const router = useRouter();
  const { colors } = useThemeColors();
  const editing = Boolean(income);

  const [amount, setAmount] = useState(income?.amount ?? '');
  const [date, setDate] = useState(income?.date?.slice(0, 10) ?? today());
  const [sourceId, setSourceId] = useState<string | null>(income?.source_id ?? null);
  const [wallet, setWallet] = useState<Wallet>(income?.wallet ?? 'account');
  const [notes, setNotes] = useState(income?.notes ?? '');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);

  const fetchSources = useCallback(() => listIncomeSources(), []);
  const sources = useQuery(fetchSources);
  const sourceName = sources.data?.data.find((s) => s.id === sourceId)?.name ?? 'None';

  const submit = async () => {
    if (pending) return;

    const amountError = validateAmount(amount);
    setErrors(amountError ? { amount: amountError } : {});
    setNotice(null);
    if (amountError) return;

    setPending('save');
    try {
      const body = {
        amount: normalizeAmount(amount),
        date,
        sourceId,
        wallet,
        notes: notes.trim() || null,
      };

      const saved = editing && income ? await updateIncome(income.id, body) : await createIncome(body);

      // The API returns a warning when the configured percentages do not total
      // 100. It saved either way — this reports what actually happened to the
      // money rather than pretending the split was clean.
      if (saved.warning) {
        Alert.alert('Recorded, with a caveat', saved.warning, [
          { text: 'Review split', onPress: () => router.replace('/settings/distribution') },
          { text: 'OK', style: 'cancel', onPress: () => router.back() },
        ]);
        return;
      }

      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) setNotice(error.message);
      } else {
        setNotice('Could not save this income. Try again.');
      }
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = () => {
    if (!income) return;
    Alert.alert(
      'Delete this income?',
      'Its split is removed with it, so your reports stay consistent.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setPending('delete');
            try {
              await deleteIncome(income.id);
              router.back();
            } catch (error) {
              setNotice(error instanceof ApiError ? error.message : 'Could not delete this income.');
            } finally {
              setPending(null);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <TextField
        label={`Amount (${CURRENCY})`}
        icon="wallet-outline"
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setErrors((c) => (c.amount ? { ...c, amount: '' } : c));
        }}
        placeholder="0.00"
        keyboardType="decimal-pad"
        autoFocus={!editing}
        editable={!pending}
        error={errors.amount}
      />

      <DateField label="Date received" value={date} onChange={setDate} error={errors.date} />

      <TextField
        label="Source"
        icon="briefcase-outline"
        editable={false}
        onPressField={() => setSheetOpen(true)}
        hint="Optional. Salary, a client, a side job."
        error={errors.sourceId}>
        <Text
          style={[
            Type.field,
            { color: sourceId ? colors.ink : colors.muted, paddingVertical: 16 },
          ]}>
          {sourceName}
        </Text>
      </TextField>

      <Text style={[Type.label, { color: colors.muted, marginBottom: 8 }]}>Received into</Text>
      <View className="mb-4">
        <ChipSelect options={WALLET_OPTIONS} value={wallet} onChange={setWallet} label="Wallet" />
      </View>

      <TextField
        label="Notes"
        icon="document-text-outline"
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything worth remembering"
        multiline
        maxLength={1000}
        editable={!pending}
        error={errors.notes}
      />

      {notice ? <AuthNotice message={notice} /> : null}

      <View className="mt-2">
        <ActionButton
          label={editing ? 'Save changes' : 'Record income'}
          pendingLabel="Saving…"
          onPress={submit}
          pending={pending === 'save'}
          disabled={pending === 'delete'}
        />
      </View>

      {editing && income ? (
        <>
          <SectionHeader title="How this was split" />
          <Card>
            <SplitBar
              segments={income.distribution.map((split) => ({
                key: split.id,
                label: split.category_name,
                value: split.amount,
                meta: percent(split.percentage_applied),
              }))}
              emptyLabel="This income was recorded before any categories existed, so none of it was split."
            />
            <Text style={[Type.caption, { color: colors.muted, marginTop: 12 }]}>
              Saving a change re-splits this income using your current percentages.
            </Text>
          </Card>

          <Pressable
            onPress={confirmDelete}
            disabled={pending !== null}
            accessibilityRole="button"
            className="mt-6 items-center py-4"
            style={({ pressed }) => ({
              borderRadius: RADIUS * 2,
              borderWidth: 1,
              borderColor: colors.error,
              opacity: pressed || pending ? 0.6 : 1,
            })}>
            <Text style={[Type.action, { color: colors.error }]}>
              {pending === 'delete' ? 'Deleting…' : 'Delete income'}
            </Text>
          </Pressable>
        </>
      ) : null}

      <OptionSheet
        visible={sheetOpen}
        title="Income source"
        options={(sources.data?.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
        selectedId={sourceId}
        onSelect={setSourceId}
        onClose={() => setSheetOpen(false)}
        noneLabel="No source"
      />
    </>
  );
}
