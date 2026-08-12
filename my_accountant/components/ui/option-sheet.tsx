import { Modal, ScrollView, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RADIUS, Type } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * A bottom sheet for picking one item from a list — an income source, an
 * expense category.
 *
 * These lists are user-created and unbounded, which is why they are not chips.
 * The sheet always offers "None" where the API allows a null, because an income
 * without a source is valid and the user needs a way back to that.
 */
export interface SheetOption {
  id: string;
  label: string;
}

export function OptionSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  allowNone = true,
  noneLabel = 'None',
  emptyBody,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  allowNone?: boolean;
  noneLabel?: string;
  emptyBody?: string;
}) {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();

  const row = (id: string | null, label: string) => {
    const selected = selectedId === id;
    return (
      <Pressable
        key={id ?? '__none__'}
        onPress={() => {
          onSelect(id);
          onClose();
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        className="flex-row items-center px-6 py-4"
        style={({ pressed }) => ({ backgroundColor: pressed ? colors.inputFill : 'transparent' })}>
        <Text
          style={[
            Type.body,
            { color: selected ? colors.primary : colors.ink, flex: 1, fontWeight: selected ? '600' : '400' },
          ]}>
          {label}
        </Text>
        {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}>
        {/* Stops a tap inside the sheet from closing it. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: RADIUS * 3,
            borderTopRightRadius: RADIUS * 3,
            maxHeight: '70%',
          }}>
          <View className="flex-row items-center px-6 pb-2 pt-5">
            <Text accessibilityRole="header" style={[Type.section, { color: colors.ink, flex: 1 }]}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
            {allowNone ? row(null, noneLabel) : null}
            {options.length === 0 && !allowNone ? (
              <Text style={[Type.caption, { color: colors.muted, padding: 24 }]}>
                {emptyBody ?? 'Nothing to choose from yet.'}
              </Text>
            ) : null}
            {options.map((option) => row(option.id, option.label))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
