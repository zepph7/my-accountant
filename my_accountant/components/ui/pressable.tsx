import { forwardRef, useCallback, useState } from 'react';
import {
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

/**
 * A Pressable whose `style` callback actually runs.
 *
 * React Native lets `style` be a function of the press state. NativeWind's
 * interop does not: `collectInlineRules` walks the style prop expecting an
 * object or an array of objects, and anything else falls through to be read as
 * a style declaration. A function has no style keys, so every property inside
 * it is dropped and the callback is never invoked.
 *
 * The visible result is a button with no background, no height, no radius and
 * no `flexDirection` — the icon stacks above the label and the whole thing
 * renders as bare text. Object and array styles are unaffected, which is why
 * only the callback form broke.
 *
 * So the callback is resolved here, before NativeWind sees the prop, and the
 * underlying Pressable receives a plain object. `pressed` comes from
 * onPressIn/onPressOut rather than RN's internal state; that is a touch less
 * precise than RN's own dispatcher around press delays, but it is the same
 * state at the same moments for anything a user can perceive.
 *
 * `hovered` and `focused` are passed as false: this is a touch surface, and no
 * caller reads them. If a keyboard-navigable surface ever needs `focused`, wire
 * it to onFocus/onBlur here rather than reaching back for RN's Pressable.
 */
export interface PressableProps extends Omit<RNPressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
}

export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { style, onPressIn, onPressOut, ...rest },
  ref
) {
  const [pressed, setPressed] = useState(false);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true);
      onPressIn?.(event);
    },
    [onPressIn]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      onPressOut?.(event);
    },
    [onPressOut]
  );

  const resolved = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <RNPressable
      ref={ref}
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={resolved}
    />
  );
});
