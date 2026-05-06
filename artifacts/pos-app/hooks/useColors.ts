import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors() {
  const scheme = useColorScheme();
  // `dark` is optional so this hook still works when the scaffold ships
  // light-only. Cast through a narrow shape rather than `Record<string,…>`
  // so unrelated keys like `radius: number` don't get pulled into the
  // value type and trip the structural check.
  const maybeDark = (colors as { dark?: typeof colors.light }).dark;
  const palette = scheme === "dark" && maybeDark ? maybeDark : colors.light;
  return { ...palette, radius: colors.radius };
}
