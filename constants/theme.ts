export const darkTheme = {
  // Fondos — azul noche profundo
  bg: '#0A0B1E',
  surface: '#0F1029',
  card: '#161830',
  cardElevated: '#1C1F3A',
  cardHigh: '#252848',

  // Primario — Púrpura vibrante
  primary: '#7C3AED',
  primaryLight: '#9D5FF0',
  primaryDark: '#5B21B6',
  primaryGrad: ['#7C3AED', '#5B21B6'],
  primaryBg: 'rgba(124,58,237,0.15)',
  primaryBorder: 'rgba(124,58,237,0.3)',

  // Secundario — Cyan/Teal
  secondary: '#00D4FF',
  secondaryDark: '#0099BB',
  secondaryBg: 'rgba(0,212,255,0.12)',

  // Terciario — Verde logro
  tertiary: '#4DF2B1',
  tertiaryBg: 'rgba(77,242,177,0.12)',

  // Texto
  textPrimary: '#FFFFFF',
  textSecondary: '#C8D0E0',
  textMuted: '#8A96B0',
  textInverse: '#0A0B1E',

  // Semánticos
  success: '#4DF2B1',
  error: '#FF5E7D',
  warning: '#FFB84D',
  gold: '#FFD700',

  // Glassmorphism
  glass: 'rgba(22,24,48,0.8)',
  glassBorder: 'rgba(124,58,237,0.2)',
  glassLight: 'rgba(255,255,255,0.05)',

  // Sombras
  shadowPrimary: 'rgba(124,58,237,0.4)',
  shadowCard: 'rgba(0,0,0,0.4)',
  shadowDark: 'rgba(0,0,0,0.6)',
} as const;

export const lightTheme = {
  // Fondos — blanco con tinte lila
  bg: '#FAF8FF',
  surface: '#FFFFFF',
  card: '#F3EEFF',
  cardElevated: '#EDE6FF',
  cardHigh: '#E4D9FF',

  // Primario — mismo púrpura
  primary: '#7C3AED',
  primaryLight: '#9D5FF0',
  primaryDark: '#5B21B6',
  primaryGrad: ['#7C3AED', '#5B21B6'],
  primaryBg: 'rgba(124,58,237,0.08)',
  primaryBorder: 'rgba(124,58,237,0.2)',

  // Secundario — Cyan
  secondary: '#0099BB',
  secondaryDark: '#007A99',
  secondaryBg: 'rgba(0,153,187,0.08)',

  // Terciario
  tertiary: '#006C4A',
  tertiaryBg: 'rgba(0,108,74,0.08)',

  // Texto
  textPrimary: '#1A1035',
  textSecondary: '#4A3F6B',
  textMuted: '#8B7BA8',
  textInverse: '#FFFFFF',

  // Semánticos
  success: '#006C4A',
  error: '#BA1A1A',
  warning: '#7C5800',
  gold: '#B8860B',

  // Glassmorphism
  glass: 'rgba(255,255,255,0.85)',
  glassBorder: 'rgba(124,58,237,0.15)',
  glassLight: 'rgba(124,58,237,0.05)',

  // Sombras
  shadowPrimary: 'rgba(124,58,237,0.2)',
  shadowCard: 'rgba(124,58,237,0.08)',
  shadowDark: 'rgba(26,16,53,0.12)',
} as const;

export type AppTheme = typeof darkTheme | typeof lightTheme;

/** Gradiente fijo del tile “Ahorro” (spec Resumen). */
export const savingsGradient = ['#006C4A', '#4DF2B1'] as const;

/** Barras “proyección” (primario ~30% opacidad). */
export const chartProjectionFill = 'rgba(124,58,237,0.3)' as const;

export const modalOverlayScrim = 'rgba(0,0,0,0.55)' as const;

/** Anillo avatar perfil (secundario ~40% opacidad, spec). */
export function avatarRingBorder(isDark: boolean) {
  return isDark ? ('rgba(0,212,255,0.4)' as const) : ('rgba(0,153,187,0.35)' as const);
}

export function logoutRowStyle(isDark: boolean) {
  return isDark
    ? { backgroundColor: 'rgba(255,94,125,0.1)' as const, borderColor: 'rgba(255,94,125,0.3)' as const }
    : { backgroundColor: 'rgba(186,26,26,0.1)' as const, borderColor: 'rgba(186,26,26,0.3)' as const };
}

/** Texto sobre superficies `primaryGrad` (contraste fijo). */
export const onPrimaryGradient = {
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.7)',
  iconGlass: 'rgba(255,255,255,0.2)',
} as const;
