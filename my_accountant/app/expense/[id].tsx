import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExpenseForm } from '@/components/forms/expense-form';
import { Screen } from '@/components/ui/screen';
import { useQuery } from '@/hooks/use-query';
import { getExpense } from '@/lib/endpoints';
import { dateTime } from '@/lib/format';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const fetcher = useCallback(() => getExpense(id), [id]);
  const { data, error, loading, reload } = useQuery(fetcher);

  return (
    <Screen
      title="Expense"
      subtitle={data ? dateTime(data.occurred_at) : undefined}
      back
      loading={loading}
      error={error}
      onRetry={reload}>
      {/* Keyed on the record so opening a different expense rebuilds the fields. */}
      {data ? <ExpenseForm key={data.id} expense={data} /> : null}
    </Screen>
  );
}
