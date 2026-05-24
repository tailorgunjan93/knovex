/**
 * Knovex MUI v6 Theme Definitions
 *
 * Three themes: light | medium | dark
 * All share the same component overrides — only the palette differs.
 *
 * Knovex brand colour: #7C3AED (violet)
 * Accent: #10B981 (emerald)
 */

import { createTheme, type Theme } from '@mui/material/styles'

// ─── Shared design tokens ────────────────────────────────────────────────────

const BRAND = {
  primary: '#7C3AED',
  primaryDark: '#6D28D9',
  primaryLight: '#A78BFA',
  accent: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
}

const sharedComponents: Theme['components'] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        textTransform: 'none',
        fontWeight: 500,
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
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      arrow: true,
    },
  },
  MuiTextField: {
    defaultProps: {
      size: 'small',
    },
  },
  MuiSelect: {
    defaultProps: {
      size: 'small',
    },
  },
}

const sharedTypography = {
  fontFamily: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    'sans-serif',
  ].join(','),
  h1: { fontWeight: 700 },
  h2: { fontWeight: 700 },
  h3: { fontWeight: 600 },
  h4: { fontWeight: 600 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },
}

// ─── Light theme ─────────────────────────────────────────────────────────────

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: BRAND.primary,
      dark: BRAND.primaryDark,
      light: BRAND.primaryLight,
    },
    secondary: {
      main: BRAND.accent,
    },
    error: { main: BRAND.error },
    warning: { main: BRAND.warning },
    info: { main: BRAND.info },
    background: {
      default: '#F8F7FF',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1523',
      secondary: '#6B7280',
    },
  },
  typography: sharedTypography,
  components: sharedComponents,
})

// ─── Medium (grey) theme ──────────────────────────────────────────────────────

export const mediumTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: BRAND.primary,
      dark: BRAND.primaryDark,
      light: BRAND.primaryLight,
    },
    secondary: {
      main: BRAND.accent,
    },
    error: { main: BRAND.error },
    warning: { main: BRAND.warning },
    info: { main: BRAND.info },
    background: {
      default: '#F0EFF5',
      paper: '#E8E7F0',
    },
    text: {
      primary: '#1A1523',
      secondary: '#6B7280',
    },
  },
  typography: sharedTypography,
  components: sharedComponents,
})

// ─── Dark theme ───────────────────────────────────────────────────────────────

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: BRAND.primaryLight,
      dark: BRAND.primary,
      light: '#C4B5FD',
    },
    secondary: {
      main: BRAND.accent,
    },
    error: { main: BRAND.error },
    warning: { main: BRAND.warning },
    info: { main: BRAND.info },
    background: {
      default: '#0F0D17',
      paper: '#1A1627',
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#9CA3AF',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: sharedTypography,
  components: {
    ...sharedComponents,
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
        },
      },
    },
  },
})

// ─── Theme map ────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'medium' | 'dark'

export const themeMap: Record<ThemeMode, Theme> = {
  light: lightTheme,
  medium: mediumTheme,
  dark: darkTheme,
}

export function getTheme(mode: string): Theme {
  return themeMap[mode as ThemeMode] ?? darkTheme
}
