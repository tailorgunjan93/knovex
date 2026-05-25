/**
 * Knovex MUI v6 Theme Definitions
 *
 * Three themes: light | medium | dark
 * All share the same component overrides — only the palette differs.
 *
 * Design language: warm dark palette matching the Knovex download page.
 *   Dark bg  : #0B0B0C  (near-black, warm)
 *   Light bg : #F5F1EA  (warm parchment)
 *   Accent   : #C8924A  (copper — oklch(0.78 0.13 60) approximation)
 *   Font     : Geist (same as website)
 */

import { createTheme, type Theme, alpha } from '@mui/material/styles'

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const BRAND = {
  // Copper accent — matches oklch(0.78 0.13 60) from the download page
  copper:      '#C8924A',
  copperDark:  '#A06B2A',
  copperLight: '#E8BC7A',

  error:   '#EF4444',
  warning: '#F59E0B',
  info:    '#3B82F6',
  success: '#10B981',
}

// ─── Font stack ───────────────────────────────────────────────────────────────

const fontStack = [
  '"Geist"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'system-ui',
  'sans-serif',
].join(',')

const monoStack = [
  '"Geist Mono"',
  '"Fira Code"',
  '"Cascadia Code"',
  'monospace',
].join(',')

// ─── Shared component overrides ───────────────────────────────────────────────

const sharedComponents: Theme['components'] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        textTransform: 'none',
        fontWeight: 500,
        letterSpacing: '0.01em',
      },
      containedPrimary: {
        background: `linear-gradient(135deg, ${BRAND.copper}, ${BRAND.copperDark})`,
        color: '#1A140C',
        '&:hover': {
          background: `linear-gradient(135deg, ${BRAND.copperLight}, ${BRAND.copper})`,
        },
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 6,
        fontFamily: fontStack,
      },
    },
  },
  MuiTooltip: {
    defaultProps: { arrow: true },
  },
  MuiTextField: {
    defaultProps: { size: 'small' },
  },
  MuiSelect: {
    defaultProps: { size: 'small' },
  },
  MuiCssBaseline: {
    styleOverrides: {
      'code, kbd, samp, pre': {
        fontFamily: monoStack,
      },
    },
  },
}

const sharedTypography = {
  fontFamily: fontStack,
  h1: { fontWeight: 700 },
  h2: { fontWeight: 700 },
  h3: { fontWeight: 600 },
  h4: { fontWeight: 600 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },
  body1: { letterSpacing: '0.01em' },
  body2: { letterSpacing: '0.01em' },
}

// ─── Dark theme (default) — warm near-black + copper ─────────────────────────

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  BRAND.copper,
      dark:  BRAND.copperDark,
      light: BRAND.copperLight,
    },
    secondary: {
      main: BRAND.success,
    },
    error:   { main: BRAND.error },
    warning: { main: BRAND.warning },
    info:    { main: BRAND.info },
    background: {
      default: '#0B0B0C',
      paper:   '#111114',
    },
    text: {
      primary:   '#F5F1EA',
      secondary: 'rgba(245,241,234,0.65)',
      disabled:  'rgba(245,241,234,0.32)',
    },
    divider: 'rgba(245,241,234,0.08)',
    action: {
      hover:    alpha(BRAND.copper, 0.10),
      selected: alpha(BRAND.copper, 0.16),
      focus:    alpha(BRAND.copper, 0.12),
    },
  },
  typography: sharedTypography,
  components: {
    ...sharedComponents,
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(245,241,234,0.07)',
        },
        elevation1: {
          backgroundColor: '#111114',
        },
        elevation2: {
          backgroundColor: '#16161A',
        },
      },
    },
    MuiButton: {
      ...sharedComponents.MuiButton,
      styleOverrides: {
        ...sharedComponents.MuiButton?.styleOverrides,
        outlined: {
          borderColor: 'rgba(245,241,234,0.18)',
          '&:hover': {
            borderColor: BRAND.copper,
            backgroundColor: alpha(BRAND.copper, 0.08),
          },
        },
      },
    },
  },
})

// ─── Light theme — warm parchment + copper ────────────────────────────────────

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main:  BRAND.copper,
      dark:  BRAND.copperDark,
      light: BRAND.copperLight,
    },
    secondary: {
      main: BRAND.success,
    },
    error:   { main: BRAND.error },
    warning: { main: BRAND.warning },
    info:    { main: BRAND.info },
    background: {
      default: '#F5F1EA',
      paper:   '#EFEAE0',
    },
    text: {
      primary:   '#14120E',
      secondary: 'rgba(20,18,14,0.65)',
      disabled:  'rgba(20,18,14,0.32)',
    },
    divider: 'rgba(20,18,14,0.08)',
    action: {
      hover:    alpha(BRAND.copper, 0.08),
      selected: alpha(BRAND.copper, 0.14),
      focus:    alpha(BRAND.copper, 0.10),
    },
  },
  typography: sharedTypography,
  components: {
    ...sharedComponents,
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(20,18,14,0.08)',
        },
      },
    },
  },
})

// ─── Medium theme — mid-grey warm + copper ────────────────────────────────────

export const mediumTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main:  BRAND.copper,
      dark:  BRAND.copperDark,
      light: BRAND.copperLight,
    },
    secondary: {
      main: BRAND.success,
    },
    error:   { main: BRAND.error },
    warning: { main: BRAND.warning },
    info:    { main: BRAND.info },
    background: {
      default: '#E7E1D5',
      paper:   '#DDD7CB',
    },
    text: {
      primary:   '#14120E',
      secondary: 'rgba(20,18,14,0.65)',
      disabled:  'rgba(20,18,14,0.32)',
    },
    divider: 'rgba(20,18,14,0.10)',
    action: {
      hover:    alpha(BRAND.copper, 0.08),
      selected: alpha(BRAND.copper, 0.14),
      focus:    alpha(BRAND.copper, 0.10),
    },
  },
  typography: sharedTypography,
  components: {
    ...sharedComponents,
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(20,18,14,0.10)',
        },
      },
    },
  },
})

// ─── Theme map ────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'medium' | 'dark'

export const themeMap: Record<ThemeMode, Theme> = {
  light:  lightTheme,
  medium: mediumTheme,
  dark:   darkTheme,
}

export function getTheme(mode: string): Theme {
  return themeMap[mode as ThemeMode] ?? darkTheme
}
