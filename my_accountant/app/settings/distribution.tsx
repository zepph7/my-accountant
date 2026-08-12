import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { Card, EmptyState, SectionHeader } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SplitBar } from '@/components/ui/split-bar';
import { TextField } from '@/components/ui/text-field';
import { RADIUS, Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError } from '@/lib/api';
import {
  createDistributionCategory,
  deleteDistributionCategory,
  listDistributionCategories,
  updateDistributionCategory,
  type DistributionCategory,
} from '@/lib/endpoints';
import { percent } from '@/lib/format';
import { validateLabel, validatePercentage } from '@/lib/money-validation';

/**
 * The percentages every income is divided by.
 *
 * A total other than 100% is a warning, not an error — the API is explicit that
 * it saves either way. Under 100 leaves part of each income undistributed; over
 * 100 distributes more than arrived. Both are shown as what they are, because
 * silently correcting either would be the app overruling a deliberate choice.
 */
export default function DistributionScreen() {
  const { colors } = useThemeColors();
  const fetcher = useCallback(() => listDistributionCategories(), []);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  const [editing, setEditing] = useState<DistributionCategory | null>(null);
  const [adding, setAdding] = useState(false);

  const categories = data?.data ?? [];
  const total = categories.reduce((sum, c) => sum + Number(c.percentage), 0);
  const balanced = Math.abs(total - 100) < 0.005;

  const remove = (category: DistributionCategory) => {
    Alert.alert(
      `Remove ${category.name}?`,
      'Income already recorded keeps the split it was given. Only future income changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDistributionCategory(category.id);
              reload();
            } catch (cause) {
              Alert.alert(
                'Could not remove it',
                cause instanceof ApiError ? cause.message : 'Try again in a moment.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <Screen
      title="Distribution"
      subtitle="How every income is split"
      back
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      <Card>
        <View className="mb-4 flex-row items-center">
          <Text style={[Type.body, { color: colors.muted, flex: 1 }]}>Total allocated</Text>
          <Text
            style={[
              Type.amount,
              { color: balanced ? colors.success : colors.warning, fontSize: 18 },
            ]}>
            {percent(total)}
          </Text>
        </View>

        <SplitBar
          segments={categories.map((c) => ({
            key: c.id,
            label: c.name,
            value: c.percentage,
            meta: percent(c.percentage),
          }))}
          emptyLabel="No categories yet, so nothing is being split."
        />

        {!balanced && categories.length > 0 ? (
          <View
            className="mt-4 flex-row items-start p-3"
            style={{ borderRadius: RADIUS, borderWidth: 1, borderColor: colors.warning }}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <Text style={[Type.caption, { color: colors.ink, flex: 1, marginLeft: 10 }]}>
              {total < 100
                ? `${percent(100 - total)} of every income is left undistributed.`
                : `Splits exceed each income by ${percent(total - 100)}.`}
            </Text>
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Categories" actionLabel="Add" onAction={() => setAdding(true)} />

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            icon="pie-chart-outline"
            title="No categories"
            body="Add categories and every income you record is divided between them automatically."
            actionLabel="Add a category"
            onAction={() => setAdding(true)}
          />
        </Card>
      ) : (
        <Card>
          {categories.map((category, index) => (
            <View
              key={category.id}
              className="flex-row items-center py-3.5"
              style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
              <View className="flex-1">
                <Text style={[Type.body, { color: colors.ink, fontWeight: '600' }]}>
                  {category.name}
                </Text>
                <Text style={[Type.caption, { color: colors.muted, marginTop: 1 }]}>
                  {percent(category.percentage)} of every income
                </Text>
              </View>

              <Pressable
                onPress={() => setEditing(category)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${category.name}`}
                hitSlop={8}
                className="px-3 py-2">
                <Ionicons name="create-outline" size={19} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => remove(category)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${category.name}`}
                hitSlop={8}
                className="pl-2 py-2">
                <Ionicons name="trash-outline" size={19} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {adding || editing ? (
        <CategoryEditor
          category={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
            reload();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Inline editor, shown under the list rather than on a screen of its own. */
function CategoryEditor({
  category,
  onDone,
  onCancel,
}: {
  category: DistributionCategory | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [percentage, setPercentage] = useState(category?.percentage ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;

    const next: Record<string, string> = {};
    const nameError = validateLabel(name, 'name');
    if (nameError) next.name = nameError;
    const percentError = validatePercentage(percentage);
    if (percentError) next.percentage = percentError;

    setNotice(null);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      const body = { name: name.trim(), percentage: percentage.trim() };
      if (category) await updateDistributionCategory(category.id, body);
      else await createDistributionCategory(body);
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) setNotice(error.message);
      } else {
        setNotice('Could not save this category. Try again.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <View className="mt-6">
      <SectionHeader title={category ? `Edit ${category.name}` : 'New category'} />
      <Card>
        <TextField
          label="Name"
          icon="pricetag-outline"
          value={name}
          onChangeText={setName}
          placeholder="Savings"
          autoCapitalize="words"
          autoFocus={!category}
          editable={!pending}
          error={errors.name}
        />
        <TextField
          label="Percentage of each income"
          icon="pie-chart-outline"
          value={percentage}
          onChangeText={setPercentage}
          placeholder="20"
          keyboardType="decimal-pad"
          editable={!pending}
          error={errors.percentage}
        />

        {notice ? <AuthNotice message={notice} /> : null}

        <ActionButton
          label={category ? 'Save' : 'Add category'}
          pendingLabel="Saving…"
          onPress={submit}
          pending={pending}
        />
        <View className="mt-3">
          <ActionButton label="Cancel" variant="outline" onPress={onCancel} disabled={pending} />
        </View>
      </Card>
    </View>
  );
}
