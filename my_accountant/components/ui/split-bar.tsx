import { Text, View } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { money } from '@/lib/format';

/**
 * A proportional bar over a legend, used wherever money is divided into parts —
 * the distribution of an income, spending by category, the configured split.
 *
 * Segments are weighted by value, so a bar whose parts do not add up to the
 * whole looks wrong on sight rather than needing to be read. That is the point:
 * a distribution that totals 90% is a real condition the API reports, and the
 * shape shows it before the warning text does.
 */
export interface SplitSegment {
  key: string;
  label: string;
  value: string;
  /** Secondary figure shown after the label — usually a percentage. */
  meta?: string;
}

/**
 * A fixed ramp rather than one colour per category name.
 *
 * Categories are user-defined and can be renamed or deleted, so any mapping
 * from name to colour would break the moment someone edits one. Position in the
 * list is stable within a single render, which is all a legend needs.
 */
const RAMP_LIGHT = ['#1E88E5', '#1565C0', '#64B5F6', '#F59E0B', '#22C55E', '#475569'];
const RAMP_DARK = ['#64B5F6', '#1E88E5', '#90CAF9', '#FBBF24', '#4ADE80', '#94A3B8'];

export function SplitBar({
  segments,
  emptyLabel = 'Nothing recorded yet',
}: {
  segments: SplitSegment[];
  emptyLabel?: string;
}) {
  const { colors, scheme } = useThemeColors();
  const ramp = scheme === 'dark' ? RAMP_DARK : RAMP_LIGHT;

  const weights = segments.map((s) => Math.max(Number(s.value) || 0, 0));
  const total = weights.reduce((sum, w) => sum + w, 0);

  if (segments.length === 0 || total === 0) {
    return (
      <View>
        <View
          style={{ height: 10, borderRadius: 5, backgroundColor: colors.inputFill }}
        />
        <Text style={[Type.caption, { color: colors.muted, marginTop: 12 }]}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View>
      <View
        className="flex-row overflow-hidden"
        style={{ height: 10, borderRadius: 5, backgroundColor: colors.inputFill }}>
        {segments.map((segment, index) => (
          <View
            key={segment.key}
            style={{
              flex: weights[index] ?? 0,
              backgroundColor: ramp[index % ramp.length],
            }}
          />
        ))}
      </View>

      <View className="mt-4">
        {segments.map((segment, index) => (
          <View key={segment.key} className="flex-row items-center py-1.5">
            <View
              className="mr-3"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: ramp[index % ramp.length],
              }}
            />
            <Text style={[Type.body, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
              {segment.label}
            </Text>
            {segment.meta ? (
              <Text style={[Type.caption, { color: colors.muted, marginRight: 10 }]}>
                {segment.meta}
              </Text>
            ) : null}
            <Text style={[Type.body, { color: colors.ink, fontWeight: '600' }]}>
              {money(segment.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
