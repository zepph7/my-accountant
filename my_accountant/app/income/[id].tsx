import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { IncomeForm } from '@/components/forms/income-form';
import { Screen } from '@/components/ui/screen';
import { useQuery } from '@/hooks/use-query';
import { getIncome } from '@/lib/endpoints';
import { longDate } from '@/lib/format';

export default function IncomeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const fetcher = useCallback(() => getIncome(id), [id]);
  const { data, error, loading, reload } = useQuery(fetcher);

  return (
    <Screen
      title="Income"
      subtitle={data ? longDate(data.date) : undefined}
      back
      loading={loading}
      error={error}
      onRetry={reload}>
      {/*
        Keyed on the record so the form's state is rebuilt if a different
        income is opened — without it, React would reuse the mounted component
        and keep the previous record's values in the fields.
      */}
      {data ? <IncomeForm key={data.id} income={data} /> : null}
    </Screen>
  );
}
