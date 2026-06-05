/**
 * Knovex MUI v6 Theme Definitions
 *
 * Three themes: dark | medium | light
 * Palette values synced exactly with KnovexUI styles.css CSS variables.
 *
 * Dark  — near-black obsidian  (--bg: #0B0B0C, --surface: #111114)
 * Mid   — charcoal warm dark   (--bg: #1C1B1F, --surface: #23222A) ← also dark mode
 * Light — warm parchment paper (--bg: #F5F1EA, --surface: #FFFBF3)
 */

import { createTheme, type Theme, alpha } from '@mui/material/styles'
import { BRAND as TOKENS } from './tokens'

// ─── Brand tokens ─────────────────────────────────────────────────────────────
// Copper family sourced from the shared single-source-of-truth tokens
// (src/theme/tokens.ts). The MUI-specific semantic colors below are kept local
// and unchanged to avoid any visual regression to the existing themes.

const BRAND = {
  // Amber accent — matches oklch(0.78 0.13 60) / KnovexUI #dda76a
  copper:      TOKENS.copper,
  copperDark:  TOKENS.copperDark,
  copperLight: TOKENS.copperLight,

  error:   '#EF4444',
  warning: '#F59E0B',
  info:    '#3B82F6',
  success: '#10B981',
}

// ─── Font stack ───────────────────────────────────────────────────────────────

const fontStack = [
  '"IBM Plex Sans"',
  '"Geist"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'system-ui',
  'sans-serif',
].join(',')

const monoStack = [
  '"IBM Plex Mono"',
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

// ─── Dark theme — deep obsidian + amber ──────────────────────────────────────
// Matches: --bg:#0B0B0C  --surface:#111114  --surface-2:#16161A  --surface-3:#1D1D22

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  BRAND.copper,
      dark:  BRAND.copperDark,
      light: BRAND.copperLight,
    },
    secondary: { main: BRAND.success },
    error:   { main: BRAND.error },
    warning: { main: BRAND.warning },
    info:    { main: BRAND.info },
    background: {
      default: '#0B0B0C',   // --bg
      paper:   '#111114',   // --surface
    },
    text: {
      primary:   '#F5F1EA',                    // --text
      secondary: 'rgba(245,241,234,0.62)',     // --text-2 approx
      disabled:  'rgba(245,241,234,0.30)',     // --text-3 approx
    },
    divider: '#26252B',   // --border
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
        // De-boxed: no global border — surfaces read via elevation/background,
        // not a 1px outline (the redesign's "elevation over borders"). Components
        // that genuinely need a hairline set it explicitly.
        root: {
          backgroundImage: 'none',
        },
        elevation1: { backgroundColor: '#111114' },
        elevation2: { backgroundColor: '#16161A' },
        elevation3: { backgroundColor: '#1D1D22' },
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

// ─── Medium theme — charcoal warm dark + amber ────────────────────────────────
// Matches: --bg:#1C1B1F  --surface:#23222A  --surface-2:#2A2932  --surface-3:#34323C
// NOTE: This is ALSO a dark-mode theme (dark text on dark bg, white text)

export const mediumTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  BRAND.copper,
      dark:  BRAND.copperDark,
      light: BRAND.copperLight,
    },
    secondary: { main: BRAND.success },
    error:   { main: BRAND.error },
    warning: { main: BRAND.warning },
    info:    { main: BRAND.info },
    background: {
      default: '#1C1B1F',   // --bg (mid)
      paper:   '#23222A',   // --surface (mid)
    },
    text: {
      primary:   '#F5F1EA',                    // --text (same as dark)
      secondary: 'rgba(245,241,234,0.62)',
      disabled:  'rgba(245,241,234,0.32)',
    },
    divider: '#3A3842',   // --border (mid)
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
        },
        elevation1: { backgroundColor: '#23222A' },
        elevation2: { backgroundColor: '#2A2932' },
        elevation3: { backgroundColor: '#34323C' },
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

// ─── Light theme — warm parchment paper + amber ───────────────────────────────
// Matches: --bg:#F5F1EA  --surface:#FFFBF3  --surface-2:#EFEAE0  --surface-3:#E7E1D5

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main:  BRAND.copper,
      dark:  BRAND.copperDark,
      light: BRAND.copperLight,
    },
    secondary: { main: BRAND.success },
    error:   { main: BRAND.error },
    warning: { main: BRAND.warning },
    info:    { main: BRAND.info },
    background: {
      default: '#F5F1EA',   // --bg (light)
      paper:   '#FFFBF3',   // --surface (light)
    },
    text: {
      primary:   '#14120E',                  // --text (light)
      secondary: 'rgba(20,18,14,0.65)',      // --text-2
      disabled:  'rgba(20,18,14,0.38)',      // --text-3
    },
    divider: '#DDD6C8',   // --border (light)
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
        },
        elevation1: { backgroundColor: '#FFFBF3' },
        elevation2: { backgroundColor: '#EFEAE0' },
        elevation3: { backgroundColor: '#E7E1D5' },
      },
    },
    MuiButton: {
      ...sharedComponents.MuiButton,
      styleOverrides: {
        ...sharedComponents.MuiButton?.styleOverrides,
        outlined: {
          borderColor: '#DDD6C8',
          '&:hover': {
            borderColor: BRAND.copper,
            backgroundColor: alpha(BRAND.copper, 0.07),
          },
        },
      },
    },
  },
})

// ─── Theme map ────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'medium' | 'dark'

export const themeMap: Record<ThemeMode, Theme> = {
  dark:   darkTheme,
  medium: mediumTheme,
  light:  lightTheme,
}

export function getTheme(mode: string): Theme {
  return themeMap[mode as ThemeMode] ?? darkTheme
}
