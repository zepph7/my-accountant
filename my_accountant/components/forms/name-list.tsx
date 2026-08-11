import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AuthNotice } from '@/components/auth/auth-notice';
import { ActionButton } from '@/components/ui/action-button';
import { Card, EmptyState, SectionHeader } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ApiError, type Page } from '@/lib/api';
import { validateLabel } from '@/lib/money-validation';

/**
 * Income sources and expense categories are the same screen.
 *
 * Both are a user-owned list of names with create, rename and delete, and both
 * are soft-deleted by the API so removing one never orphans the transactions
 * that referenced it. Writing this once means the two cannot drift into
 * behaving differently.
 */
export interface NamedRecord {
  id: string;
  name: string;
}

export function NameListScreen({
  title,
  subtitle,
  noun,
  icon,
  emptyBody,
  deleteNote,
  list,
  create,
  rename,
  remove,
}: {
  title: string;
  subtitle: string;
  /** Lower-case singular, used in messages: "source", "category". */
  noun: string;
  icon: keyof typeof Ionicons.glyphMap;
  emptyBody: string;
  /** What happens to existing records when one is removed. */
  deleteNote: string;
  list: () => Promise<Page<NamedRecord>>;
  create: (name: string) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}) {
  const { colors } = useThemeColors();
  const fetcher = useCallback(() => list(), [list]);
  const { data, error, loading, refreshing, refresh, reload } = useQuery(fetcher);

  const [editing, setEditing] = useState<NamedRecord | null>(null);
  const [adding, setAdding] = useState(false);

  const items = data?.data ?? [];

  const confirmRemove = (item: NamedRecord) => {
    Alert.alert(`Remove ${item.name}?`, deleteNote, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(item.id);
            reload();
          } catch (cause) {
            Alert.alert(
              `Could not remove this ${noun}`,
              cause instanceof ApiError ? cause.message : 'Try again in a moment.'
            );
          }
        },
      },
    ]);
  };

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      back
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRefresh={refresh}>
      <SectionHeader title={`${items.length} saved`} actionLabel="Add" onAction={() => setAdding(true)} />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={icon}
            title={`No ${noun}s yet`}
            body={emptyBody}
            actionLabel={`Add a ${noun}`}
            onAction={() => setAdding(true)}
          />
        </Card>
      ) : (
        <Card>
          {items.map((item, index) => (
            <View
              key={item.id}
              className="flex-row items-center py-3.5"
              style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
              <Text style={[Type.body, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable
                onPress={() => setEditing(item)}
                accessibilityRole="button"
                accessibilityLabel={`Rename ${item.name}`}
                hitSlop={8}
                className="px-3 py-2">
                <Ionicons name="create-outline" size={19} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmRemove(item)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
                hitSlop={8}
                className="py-2 pl-2">
                <Ionicons name="trash-outline" size={19} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {adding || editing ? (
        <NameEditor
          noun={noun}
          record={editing}
          save={(name) => (editing ? rename(editing.id, name) : create(name))}
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

function NameEditor({
  noun,
  record,
  save,
  onDone,
  onCancel,
}: {
  noun: string;
  record: NamedRecord | null;
  save: (name: string) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(record?.name ?? '');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;

    const invalid = validateLabel(name, 'name');
    setNotice(null);
    setError(invalid);
    if (invalid) return;

    setPending(true);
    try {
      await save(name.trim());
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.fieldErrors.name);
        if (!cause.fieldErrors.name) setNotice(cause.message);
      } else {
        setNotice(`Could not save this ${noun}. Try again.`);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <View className="mt-6">
      <SectionHeader title={record ? `Rename ${record.name}` : `New ${noun}`} />
      <Card>
        <TextField
          label="Name"
          icon="text-outline"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus={!record}
          editable={!pending}
          error={error}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {notice ? <AuthNotice message={notice} /> : null}

        <ActionButton
          label={record ? 'Save' : `Add ${noun}`}
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
