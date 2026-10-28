import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#4F46E5' },
        secondary: { main: '#0D9488' },
        background: { default: '#F6F7FB', paper: '#FFFFFF' },
        divider: 'rgba(15, 23, 42, 0.08)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#818CF8' },
        secondary: { main: '#2DD4BF' },
        background: { default: '#0B0F19', paper: '#121826' },
        divider: 'rgba(148, 163, 184, 0.14)',
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({ border: `1px solid ${theme.vars!.palette.divider}`, backgroundImage: 'none' }),
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: { root: { borderWidth: '0 0 1px 0' } },
    },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, paddingInline: 14 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
});

// Fixed colour per transfer type so it reads the same in every chart.
export const TRANSFER_TYPE_COLORS: Record<string, string> = {
  'Internet Out': '#6366F1',
  'Inter-Region Out': '#F59E0B',
  'Other Out': '#94A3B8',
  'Internet In': '#A855F7',
  'Inter-Region In': '#F97316',
  'Other In': '#CBD5E1',
  'Inter-AZ': '#10B981',
  'NAT Gateway': '#EF4444',
  'To CloudFront': '#06B6D4',
};

export const DIRECTION_COLORS: Record<string, string> = {
  Out: '#6366F1',
  In: '#A855F7',
  Transit: '#10B981',
};

export const SERIES_COLORS = ['#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#3B82F6', '#84CC16', '#A855F7', '#F97316'];
export const OTHER_COLOR = '#94A3B8';

export function colorFor(groupBy: string, key: string, index: number): string {
  if (groupBy === 'TRANSFER_TYPE') return TRANSFER_TYPE_COLORS[key] ?? OTHER_COLOR;
  if (groupBy === 'DIRECTION') return DIRECTION_COLORS[key] ?? OTHER_COLOR;
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
