import { darkTheme, lightTheme } from '@/constants/theme';

/** Paleta legacy (modo claro) para alias y compatibilidad. */
export const COLORS = {
  surface: lightTheme.surface,
  surface_container_low: lightTheme.cardElevated,
  surface_container: lightTheme.card,
  surface_container_high: lightTheme.cardElevated,
  surface_container_highest: lightTheme.cardElevated,
  surface_container_lowest: lightTheme.surface,
  surface_dim: lightTheme.cardHigh,
  surface_bright: lightTheme.surface,

  primary: lightTheme.primary,
  primary_container: lightTheme.primaryLight,
  on_primary: lightTheme.textInverse,
  on_primary_container: lightTheme.textPrimary,

  secondary: lightTheme.secondaryDark,
  secondary_container: lightTheme.secondary,
  on_secondary: lightTheme.textInverse,
  on_secondary_container: lightTheme.textPrimary,

  tertiary: lightTheme.tertiary,
  tertiary_fixed: lightTheme.tertiary,
  on_tertiary_fixed: lightTheme.textInverse,

  on_background: lightTheme.textPrimary,
  on_surface: lightTheme.textPrimary,
  on_surface_variant: lightTheme.textSecondary,
  outline_variant: lightTheme.glassBorder,

  error: lightTheme.error,
  success: lightTheme.success,
  warning: lightTheme.warning,

  glass_bg: lightTheme.glass,
  glass_blur: 24,
  glass_border: lightTheme.glassBorder,
  shadow: lightTheme.shadowCard,

  bg: lightTheme.bg,
  card: lightTheme.card,
  cardHover: lightTheme.cardElevated,
  border: lightTheme.glassBorder,
  borderLight: lightTheme.glassBorder,
  primaryDark: lightTheme.primaryDark,
  primaryBg: lightTheme.primaryBg,
  secondaryBg: lightTheme.secondaryBg,
  cyan: lightTheme.secondary,
  cyanBg: lightTheme.secondaryBg,
  textPrimary: lightTheme.textPrimary,
  textSecondary: lightTheme.textSecondary,
  textMuted: lightTheme.textMuted,
  textInverse: lightTheme.textInverse,
  danger: lightTheme.error,
  dangerBg: lightTheme.primaryBg,
  warningBg: lightTheme.tertiaryBg,
  gold: lightTheme.gold,
  goldBg: lightTheme.gold,
} as const;

export type ColorKey = keyof typeof COLORS;

const Colors = {
  light: {
    text: lightTheme.textPrimary,
    background: lightTheme.bg,
    tint: lightTheme.primary,
    tabIconDefault: lightTheme.textMuted,
    tabIconSelected: lightTheme.primary,
  },
  dark: {
    text: darkTheme.textPrimary,
    background: darkTheme.bg,
    tint: darkTheme.primary,
    tabIconDefault: darkTheme.textMuted,
    tabIconSelected: darkTheme.primary,
  },
} as const;

export default Colors;
