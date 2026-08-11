import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { dateTime, longDate } from '@/lib/format';

/**
 * A date, or a date and a time, picked with the platform's own picker.
 *
 * Typing a date is where forms lose people: `09/08` is ambiguous, `2026-8-9` is
 * rejected, and neither failure is the user's fault. The picker cannot produce
 * an invalid value, which removes a whole class of validation from the form.
 *
 * Android shows date and time as two consecutive dialogs because its native
 * picker has no combined mode; iOS shows one inline spinner. The value handed
 * back is identical either way.
 */
export function DateField({
  label,
  value,
  onChange,
  mode = 'date',
  icon = 'calendar-outline',
  error,
  hint,
}: {
  label: string;
  /** `YYYY-MM-DD` in date mode, a full ISO timestamp in datetime mode. */
  value: string;
  onChange: (next: string) => void;
  mode?: 'date' | 'datetime';
  icon?: 'calendar-outline' | 'time-outline';
  error?: string;
  hint?: string;
}) {
  const { colors, scheme } = useThemeColors();
  const [stage, setStage] = useState<'closed' | 'date' | 'time'>('closed');

  const current = toDate(value);

  const commit = (next: Date) => {
    onChange(mode === 'date' ? isoDate(next) : next.toISOString());
  };

  const handle = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setStage('closed');
    if (event.type === 'dismissed' || !picked) return;

    if (mode === 'datetime' && Platform.OS === 'android' && stage === 'date') {
      // Carry the chosen day forward and ask for the time next.
      const merged = new Date(current);
      merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      commit(merged);
      setStage('time');
      return;
    }

    if (mode === 'datetime' && Platform.OS === 'android' && stage === 'time') {
      const merged = new Date(current);
      merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      commit(merged);
      return;
    }

    commit(picked);
  };

  return (
    <>
      <TextField
        label={label}
        icon={icon}
        error={error}
        hint={hint}
        editable={false}
        onPressField={() => setStage(mode === 'datetime' ? 'date' : 'date')}>
        <Text style={[Type.field, { color: colors.ink, paddingVertical: 16 }]}>
          {mode === 'date' ? longDate(value) : dateTime(value)}
        </Text>
      </TextField>

      {stage !== 'closed' ? (
        <View className={Platform.OS === 'ios' ? 'mb-4' : ''}>
          <DateTimePicker
            value={current}
            mode={
              Platform.OS === 'ios' && mode === 'datetime'
                ? 'datetime'
                : stage === 'time'
                  ? 'time'
                  : 'date'
            }
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            // Nothing in this app can be recorded in the future — an income you
            // have not received is not income yet.
            maximumDate={new Date()}
            onChange={handle}
            themeVariant={scheme}
          />
          {Platform.OS === 'ios' ? (
            <Text
              onPress={() => setStage('closed')}
              accessibilityRole="button"
              style={[Type.link, { color: colors.primary, textAlign: 'right', paddingVertical: 8 }]}>
              Done
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** `YYYY-MM-DD` in the device's own zone, never UTC. */
const isoDate = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

/**
 * A bare `YYYY-MM-DD` is parsed as UTC midnight by `new Date`, which lands on
 * the previous day for anyone west of Greenwich. Splitting it avoids the guess.
 */
const toDate = (value: string): Date => {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};
