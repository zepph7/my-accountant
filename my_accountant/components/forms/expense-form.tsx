import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';

import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { ChipSelect, type ChipOption } from '@/components/ui/chip-select';
import { DateField } from '@/components/ui/date-field';
import { OptionSheet } from '@/components/ui/option-sheet';
import { TextField } from '@/components/ui/text-field';
import { RADIUS, Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError } from '@/lib/api';
import {
  createExpense,
  deleteExpense,
  listExpenseCategories,
  updateExpense,
  WALLETS,
  WALLET_LABELS,
  type Expense,
  type Wallet,
} from '@/lib/endpoints';
import { CURRENCY } from '@/lib/format';
import { normalizeAmount, validateAmount } from '@/lib/money-validation';

const WALLET_OPTIONS: readonly ChipOption<Wallet>[] = WALLETS.map((w) => ({
  value: w,
  label: WALLET_LABELS[w],
}));

/**
 * Record or amend an expense.
 *
 * Expenses carry a full timestamp, not just a date. That is what makes the
 * hourly spending report real — the API offers hourly buckets for expenses and
 * not for income precisely because income has no time of day on record.
 */
export function ExpenseForm({ expense }: { expense?: Expense }) {
  const router = useRouter();
  const { colors } = useThemeColors();
  const editing = Boolean(expense);

  const [amount, setAmount] = useState(expense?.amount ?? '');
  const [occurredAt, setOccurredAt] = useState(expense?.occurred_at ?? new Date().toISOString());
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category_id ?? null);
  const [wallet, setWallet] = useState<Wallet>(expense?.wallet ?? 'account');
  const [payee, setPayee] = useState(expense?.payee ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);

  const fetchCategories = useCallback(() => listExpenseCategories(), []);
  const categories = useQuery(fetchCategories);
  const categoryName =
    categories.data?.data.find((c) => c.id === categoryId)?.name ?? 'Uncategorised';

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
        occurredAt,
        categoryId,
        wallet,
        payee: payee.trim() || null,
        description: description.trim() || null,
      };

      if (editing && expense) await updateExpense(expense.id, body);
      else await createExpense(body);

      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) setNotice(error.message);
      } else {
        setNotice('Could not save this expense. Try again.');
      }
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = () => {
    if (!expense) return;
    Alert.alert('Delete this expense?', 'It is removed from every report it appears in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setPending('delete');
          try {
            await deleteExpense(expense.id);
            router.back();
          } catch (error) {
            setNotice(error instanceof ApiError ? error.message : 'Could not delete this expense.');
          } finally {
            setPending(null);
          }
        },
      },
    ]);
  };

  return (
    <>
      <TextField
        label={`Amount (${CURRENCY})`}
        icon="card-outline"
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

      <DateField
        label="When"
        value={occurredAt}
        onChange={setOccurredAt}
        mode="datetime"
        icon="time-outline"
        hint="The time matters — the hourly spending report is built from it."
        error={errors.occurredAt}
      />

      <TextField
        label="Paid to"
        icon="storefront-outline"
        value={payee}
        onChangeText={setPayee}
        placeholder="Who received the money"
        maxLength={255}
        editable={!pending}
        error={errors.payee}
      />

      <TextField
        label="Category"
        icon="pricetag-outline"
        editable={false}
        onPressField={() => setSheetOpen(true)}
        hint="Optional, but it is what the spending breakdown groups by."
        error={errors.categoryId}>
        <Text
          style={[
            Type.field,
            { color: categoryId ? colors.ink : colors.muted, paddingVertical: 16 },
          ]}>
          {categoryName}
        </Text>
      </TextField>

      <Text style={[Type.label, { color: colors.muted, marginBottom: 8 }]}>Paid from</Text>
      <View className="mb-4">
        <ChipSelect options={WALLET_OPTIONS} value={wallet} onChange={setWallet} label="Wallet" />
      </View>

      <TextField
        label="Description"
        icon="document-text-outline"
        value={description}
        onChangeText={setDescription}
        placeholder="What it was for"
        multiline
        maxLength={1000}
        editable={!pending}
        error={errors.description}
      />

      {notice ? <AuthNotice message={notice} /> : null}

      <View className="mt-2">
        <ActionButton
          label={editing ? 'Save changes' : 'Record expense'}
          pendingLabel="Saving…"
          onPress={submit}
          pending={pending === 'save'}
          disabled={pending === 'delete'}
        />
      </View>

      {editing ? (
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
            {pending === 'delete' ? 'Deleting…' : 'Delete expense'}
          </Text>
        </Pressable>
      ) : null}

      <OptionSheet
        visible={sheetOpen}
        title="Expense category"
        options={(categories.data?.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        selectedId={categoryId}
        onSelect={setCategoryId}
        onClose={() => setSheetOpen(false)}
        noneLabel="Uncategorised"
      />
    </>
  );
}
