import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { BarChart } from '@/components/ui/bar-chart';
import { Card, SectionHeader } from '@/components/ui/card';
import { ChipSelect, type ChipOption } from '@/components/ui/chip-select';
import { Screen } from '@/components/ui/screen';
import { SegmentedTabs, type TabOption } from '@/components/ui/segmented-tabs';
import { SplitBar } from '@/components/ui/split-bar';
import { Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  getCashflow,
  getExpenseReport,
  getSummary,
  type CashflowGranularity,
  type ExpenseGranularity,
} from '@/lib/endpoints';
import { bucketLabel, longDate, money, percent } from '@/lib/format';

type View_ = 'summary' | 'cashflow' | 'spending';

const VIEWS: readonly TabOption<View_>[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'cashflow', label: 'Cashflow' },
  { value: 'spending', label: 'Spending' },
];

const CASHFLOW_GRAINS: readonly ChipOption<CashflowGranularity>[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

/**
 * Cashflow stops at daily on purpose: `incomes.date` is a DATE with no time of
 * day, so an hourly income series would stack every payment at midnight and
 * draw a chart that is a lie. Spending has a real timestamp, so it goes hourly.
 */
const EXPENSE_GRAINS: readonly ChipOption<ExpenseGranularity>[] = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

export default function ReportsScreen() {
  const [view, setView] = useState<View_>('summary');

  return (
    <View className="flex-1 bg-background dark:bg-night-background">
      {view === 'summary' ? (
        <SummaryReport view={view} onChangeView={setView} />
      ) : view === 'cashflow' ? (
        <CashflowReport view={view} onChangeView={setView} />
      ) : (
        <SpendingReport view={view} onChangeView={setView} />
      )}
    </View>
  );
}

interface ReportProps {
  view: View_;
  onChangeView: (next: View_) => void;
}

function ViewTabs({ view, onChangeView }: ReportProps) {
  return (
    <View className="mb-5">
      <SegmentedTabs options={VIEWS} value={view} onChange={onChangeView} />
    </View>
  );
}

/* ------------------------------------------------------------------ summary */

function SummaryReport({ view, onChangeView }: ReportProps) {
  const { colors } = useThemeColors();
  const fetcher = useCallback(() => getSummary(), []);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  return (
    <Screen
      title="Reports"
      subtitle={data ? `${longDate(data.range.from)} — ${longDate(data.range.to)}` : 'This month'}
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      <ViewTabs view={view} onChangeView={onChangeView} />

      {data ? (
        <>
          <Card>
            <View className="flex-row">
              <Figure label="Income" value={data.income.total} note={`${data.income.count} entries`} />
              <Figure
                label="Spent"
                value={data.expenses.total}
                note={`${data.expenses.count} entries`}
              />
            </View>
            <View
              className="mt-4 pt-4"
              style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <View className="flex-row items-center">
                <Text style={[Type.body, { color: colors.muted, flex: 1 }]}>Net</Text>
                <Text
                  style={[
                    Type.amount,
                    { color: Number(data.net) < 0 ? colors.error : colors.success },
                  ]}>
                  {money(data.net)}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center">
                <Text style={[Type.caption, { color: colors.muted, flex: 1 }]}>
                  Kept out of what came in
                </Text>
                <Text style={[Type.caption, { color: colors.ink, fontWeight: '600' }]}>
                  {percent(data.savingsRate)}
                </Text>
              </View>
            </View>
          </Card>

          <SectionHeader title="Distributed" />
          <Card>
            <SplitBar
              segments={data.distributed.byCategory.map((c) => ({
                key: c.categoryId,
                label: c.name,
                value: c.total,
                meta: percent(c.shareOfDistributed),
              }))}
              emptyLabel="No income was distributed in this period."
            />
          </Card>

          <SectionHeader title="Spending by category" />
          <Card>
            <SplitBar
              segments={data.expensesByCategory.map((c) => ({
                key: c.categoryId ?? 'uncategorised',
                label: c.name,
                value: c.total,
                meta: percent(c.shareOfExpenses),
              }))}
              emptyLabel="Nothing was spent in this period."
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/* ----------------------------------------------------------------- cashflow */

function CashflowReport({ view, onChangeView }: ReportProps) {
  const { colors } = useThemeColors();
  const [grain, setGrain] = useState<CashflowGranularity>('month');

  const fetcher = useCallback(() => getCashflow({ groupBy: grain }), [grain]);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  return (
    <Screen
      title="Reports"
      subtitle={data ? `${longDate(data.range.from)} — ${longDate(data.range.to)}` : undefined}
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      <ViewTabs view={view} onChangeView={onChangeView} />

      <View className="mb-5">
        <ChipSelect options={CASHFLOW_GRAINS} value={grain} onChange={setGrain} label="Group by" scrollable />
      </View>

      {data ? (
        <>
          <Card>
            <BarChart
              series={[
                { label: 'In', color: colors.success },
                { label: 'Out', color: colors.primary },
              ]}
              groups={data.series.map((bucket) => ({
                label: bucketLabel(bucket.bucket),
                values: [bucket.income, bucket.expenses],
              }))}
              emptyLabel="Nothing recorded in this period."
            />
          </Card>

          <SectionHeader title="Totals" />
          <Card>
            <Line label="Income" value={data.totals.income} />
            <Line label="Expenses" value={data.totals.expenses} />
            <Line label="Distributed" value={data.totals.distributed} />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
            <Line
              label="Net"
              value={data.totals.net}
              tone={Number(data.totals.net) < 0 ? colors.error : colors.success}
              strong
            />
          </Card>

          <SectionHeader title="Period by period" />
          <Card>
            {data.series.length === 0 ? (
              <Text style={[Type.caption, { color: colors.muted }]}>Nothing in this period.</Text>
            ) : (
              data.series.map((bucket) => (
                <View
                  key={bucket.bucket}
                  className="py-3"
                  style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View className="flex-row items-center">
                    <Text style={[Type.body, { color: colors.ink, flex: 1, fontWeight: '600' }]}>
                      {bucketLabel(bucket.bucket)}
                    </Text>
                    <Text
                      style={[
                        Type.body,
                        {
                          color: Number(bucket.net) < 0 ? colors.error : colors.success,
                          fontWeight: '700',
                        },
                      ]}>
                      {money(bucket.net)}
                    </Text>
                  </View>
                  <Text style={[Type.caption, { color: colors.muted, marginTop: 2 }]}>
                    {`In ${money(bucket.income)} · Out ${money(bucket.expenses)}`}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/* ----------------------------------------------------------------- spending */

function SpendingReport({ view, onChangeView }: ReportProps) {
  const { colors } = useThemeColors();
  const [grain, setGrain] = useState<ExpenseGranularity>('day');

  const fetcher = useCallback(() => getExpenseReport({ groupBy: grain }), [grain]);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  return (
    <Screen
      title="Reports"
      subtitle={data ? `${longDate(data.range.from)} — ${longDate(data.range.to)}` : undefined}
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      <ViewTabs view={view} onChangeView={onChangeView} />

      <View className="mb-5">
        <ChipSelect options={EXPENSE_GRAINS} value={grain} onChange={setGrain} label="Group by" scrollable />
      </View>

      {data ? (
        <>
          <Card>
            <View className="flex-row">
              <Figure label="Total spent" value={data.total} note={`${data.count} entries`} />
              <Figure label="Average" value={data.average} note={`per ${grain}`} />
            </View>
            {data.busiest ? (
              <View
                className="mt-4 flex-row items-center pt-4"
                style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[Type.caption, { color: colors.muted, flex: 1 }]}>
                  Heaviest {grain}
                </Text>
                <Text style={[Type.caption, { color: colors.ink, fontWeight: '600' }]}>
                  {`${bucketLabel(data.busiest.bucket)} · ${money(data.busiest.total)}`}
                </Text>
              </View>
            ) : null}
          </Card>

          <SectionHeader title="Over time" />
          <Card>
            <BarChart
              series={[{ label: 'Spent', color: colors.primary }]}
              groups={data.series.map((bucket) => ({
                label: bucketLabel(bucket.bucket),
                values: [bucket.total],
              }))}
              emptyLabel="Nothing spent in this period."
            />
          </Card>

          <SectionHeader title="By category" />
          <Card>
            <SplitBar
              segments={data.byCategory.map((c) => ({
                key: c.categoryId ?? 'uncategorised',
                label: c.name,
                value: c.total,
                meta: percent(c.shareOfExpenses),
              }))}
              emptyLabel="Nothing spent in this period."
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/* -------------------------------------------------------------------- parts */

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  const { colors } = useThemeColors();
  return (
    <View className="flex-1">
      <Text style={[Type.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[Type.amount, { color: colors.ink, marginTop: 4 }]} numberOfLines={1}>
        {money(value)}
      </Text>
      {note ? (
        <Text style={[Type.caption, { color: colors.muted, marginTop: 2 }]}>{note}</Text>
      ) : null}
    </View>
  );
}

function Line({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string;
  value: string;
  tone?: string;
  strong?: boolean;
}) {
  const { colors } = useThemeColors();
  return (
    <View className="flex-row items-center py-2">
      <Text style={[Type.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text
        style={[
          Type.body,
          { color: tone ?? colors.ink, fontWeight: strong ? '700' : '600' },
        ]}>
        {money(value)}
      </Text>
    </View>
  );
}
