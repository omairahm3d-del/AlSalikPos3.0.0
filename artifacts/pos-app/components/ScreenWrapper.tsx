import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, Keyframe } from "react-native-reanimated";

const enterAnimation = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ scale: 1.07 }],
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.out(Easing.cubic),
  },
}).duration(240);

const exitAnimation = new Keyframe({
  0: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  100: {
    opacity: 0,
    transform: [{ scale: 1.07 }],
    easing: Easing.in(Easing.cubic),
  },
}).duration(180);

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenWrapper({ children, style }: Props) {
  return (
    <Animated.View
      entering={enterAnimation}
      exiting={exitAnimation}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </Animated.View>
  );
}
