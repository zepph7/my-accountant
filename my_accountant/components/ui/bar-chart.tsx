import { ScrollView, Text, View } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { compactMoney } from '@/lib/format';

/**
 * A scrolling bar chart, drawn with plain views.
 *
 * No charting library: the whole requirement is "one or two bars per bucket,
 * scaled to the largest", and every library that does that also pulls in an SVG
 * renderer and a gesture layer this app has no other use for.
 *
 * Bars scroll horizontally and are never compressed to fit. An hourly report
 * over a month is 720 buckets — squeezing those into a phone's width produces a
 * picture with no readable value in it, so the chart keeps each bar legible and
 * lets the user scroll.
 */
export interface BarSeries {
  label: string;
  color: string;
}

export interface BarGroup {
  /** Bucket label under the bars. */
  label: string;
  /** One value per series, in the same order. */
  values: string[];
}

const CHART_HEIGHT = 132;

export function BarChart({
  series,
  groups,
  emptyLabel = 'Nothing in this period.',
}: {
  series: BarSeries[];
  groups: BarGroup[];
  emptyLabel?: string;
}) {
  const { colors } = useThemeColors();

  const peak = groups.reduce(
    (max, group) => Math.max(max, ...group.values.map((v) => Number(v) || 0)),
    0
  );

  if (groups.length === 0 || peak === 0) {
    return (
      <Text style={[Type.caption, { color: colors.muted, paddingVertical: 24, textAlign: 'center' }]}>
        {emptyLabel}
      </Text>
    );
  }

  // Bars wider than one series get their own column width, so a two-series
  // chart does not become unreadably thin.
  const groupWidth = series.length > 1 ? 54 : 38;

  return (
    <View>
      <View className="mb-4 flex-row flex-wrap">
        {series.map((s) => (
          <View key={s.label} className="mr-4 flex-row items-center">
            <View
              className="mr-2"
              style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }}
            />
            <Text style={[Type.caption, { color: colors.muted }]}>{s.label}</Text>
          </View>
        ))}
        <Text style={[Type.caption, { color: colors.muted, marginLeft: 'auto' }]}>
          peak {compactMoney(String(peak))}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Newest buckets are at the right-hand end, which is where the eye
        // should land first on a time series.
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {groups.map((group, index) => (
          <View key={`${group.label}-${index}`} style={{ width: groupWidth }} className="items-center">
            <View
              className="flex-row items-end justify-center"
              style={{ height: CHART_HEIGHT }}>
              {group.values.map((value, seriesIndex) => {
                const ratio = (Number(value) || 0) / peak;
                return (
                  <View
                    key={seriesIndex}
                    style={{
                      width: series.length > 1 ? 12 : 18,
                      marginHorizontal: 2,
                      // A visible stub for a zero bucket, so an empty period
                      // reads as "nothing here" rather than "no data".
                      height: Math.max(ratio * CHART_HEIGHT, 3),
                      borderRadius: 3,
                      backgroundColor:
                        ratio === 0 ? colors.inputFill : series[seriesIndex]?.color ?? colors.primary,
                    }}
                  />
                );
              })}
            </View>
            <Text
              numberOfLines={1}
              style={[Type.caption, { color: colors.muted, fontSize: 10, marginTop: 8 }]}>
              {group.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
