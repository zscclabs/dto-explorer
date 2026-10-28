import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SettingsEthernetRounded from '@mui/icons-material/SettingsEthernetRounded';
import { exportUrl, fetchMeta, fetchSummary, toSearchParams, type Filters, type Meta, type Period, type Query, type Row, type Summary } from './api';
import BreakdownTable from './components/BreakdownTable';
import FilterBar, { dimLabel } from './components/FilterBar';
import KpiCards from './components/KpiCards';
import PeriodSelector, { type PeriodValue } from './components/PeriodSelector';
import { BreakdownChart, TrendChart, VolumeChart, VolumeShareChart } from './components/charts';
import { rangeLabel } from './format';

interface ViewState extends PeriodValue {
  groupBy: string;
  includeNatVolume: boolean;
  includeAwsInternal: boolean;
  filters: Filters;
}

const TODAY = dayjs().format('YYYY-MM-DD');

function readUrl(): ViewState {
  const p = new URLSearchParams(window.location.search);
  const filters: Filters = {};
  for (const f of p.getAll('filter')) {
    const i = f.indexOf('=');
    if (i > 0) (filters[f.slice(0, i)] ??= []).push(f.slice(i + 1));
  }
  const period = (['week', 'month', 'custom'].includes(p.get('period') ?? '') ? p.get('period') : 'month') as Period;
  return {
    period,
    anchor: period !== 'custom' ? (p.get('start') ?? TODAY) : TODAY,
    start: p.get('start') ?? dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
    end: p.get('end') ?? dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    groupBy: p.get('group_by') ?? 'REGION',
    includeNatVolume: p.get('include_nat_volume') === 'true',
    includeAwsInternal: p.get('include_aws_internal') === 'true',
    filters,
  };
}

function toQuery(s: ViewState): Query {
  return {
    period: s.period,
    start: s.period === 'custom' ? s.start : s.anchor,
    end: s.period === 'custom' ? s.end : undefined,
    groupBy: s.groupBy,
    includeNatVolume: s.includeNatVolume,
    includeAwsInternal: s.includeAwsInternal,
    filters: s.filters,
  };
}

/** Where a row click on each breakdown leads next. */
function nextDimension(groupBy: string): string | null {
  if (groupBy === 'REGION') return 'LINKED_ACCOUNT';
  if (groupBy === 'LINKED_ACCOUNT') return 'TRANSFER_TYPE';
  if (groupBy === 'DIRECTION') return 'TRANSFER_TYPE';
  if (groupBy === 'TRANSFER_TYPE') return 'USAGE_TYPE';
  if (groupBy === 'USAGE_TYPE') return 'LINKED_ACCOUNT';
  if (groupBy.startsWith('COST_CATEGORY:')) return 'LINKED_ACCOUNT';
  return 'TRANSFER_TYPE'; // SERVICE, TAG:*
}

function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const effective = mode === 'system' ? systemMode : mode;
  if (!effective) return null;
  const dark = effective === 'dark';
  return (
    <Tooltip title={dark ? 'Light mode' : 'Dark mode'}>
      <IconButton onClick={() => setMode(dark ? 'light' : 'dark')} aria-label="Toggle colour mode">
        {dark ? <LightModeRounded /> : <DarkModeRounded />}
      </IconButton>
    </Tooltip>
  );
}

export default function App() {
  const [view, setView] = useState<ViewState>(readUrl);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(() => toQuery(view), [view]);
  const update = useCallback((patch: Partial<ViewState>) => setView((v) => ({ ...v, ...patch })), []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMeta(ctrl.signal)
      .then((m) => {
        setMeta(m);
        // Offer VPC-style grouping by default when a matching tag key is configured.
        if (m.default_tag_key && !new URLSearchParams(window.location.search).has('group_by')) {
          setView((v) => ({ ...v, groupBy: `TAG:${m.default_tag_key}` }));
        }
      })
      .catch((e) => e.name !== 'AbortError' && setError(`Could not load metadata: ${e.message}`));
    return () => ctrl.abort();
  }, [reloadToken]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetchSummary(query, ctrl.signal)
      .then((s) => {
        setData(s);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
    window.history.replaceState(null, '', `?${toSearchParams(query)}`);
    return () => ctrl.abort();
  }, [query, reloadToken]);

  const valueLabel = useCallback(
    (dim: string, value: string) => {
      if (dim === 'LINKED_ACCOUNT') return meta?.accounts.find((a) => a.value === value)?.label ?? value;
      if (dim === 'REGION') return meta?.regions.find((r) => r.value === value)?.label ?? value;
      if (value === '' && dim.includes(':')) return '(untagged)';
      return value;
    },
    [meta],
  );

  const groupLabel = dimLabel(meta, view.groupBy);
  const next = nextDimension(view.groupBy);

  const drill = (row: Row) => {
    if (!next) return;
    const current = view.filters[view.groupBy] ?? [];
    update({
      filters: { ...view.filters, [view.groupBy]: current.includes(row.key) ? current : [...current, row.key] },
      groupBy: next,
    });
  };

  // Hiding traffic within AWS also drops any transfer type filter on those types, which would otherwise match nothing.
  const setIncludeAwsInternal = (includeAwsInternal: boolean) => {
    const hidden = includeAwsInternal ? [] : (meta?.aws_internal_types ?? []);
    const types = (view.filters.TRANSFER_TYPE ?? []).filter((t) => !hidden.includes(t));
    const filters: Filters = { ...view.filters, TRANSFER_TYPE: types };
    if (!types.length) delete filters.TRANSFER_TYPE;
    update({ includeAwsInternal, filters });
  };

  const refresh = async () => {
    await fetch('/api/cache/clear', { method: 'POST' }).catch(() => undefined);
    setReloadToken((t) => t + 1);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" sx={{ bgcolor: 'background.paper', backdropFilter: 'blur(8px)' }}>
        <Toolbar sx={{ gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              background: 'linear-gradient(135deg, #6366F1 0%, #14B8A6 100%)',
            }}
          >
            <SettingsEthernetRounded fontSize="small" />
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
              DTO Explorer
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              AWS data transfer volume · Cost Explorer
            </Typography>
          </Box>
          {meta?.mock && <Chip size="small" color="warning" label="Mock data" />}
          <Tooltip title="Download CSV">
            <IconButton component="a" href={exportUrl(query)} aria-label="Download CSV">
              <DownloadRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh (bypasses cache, costs Cost Explorer API calls)">
            <IconButton onClick={refresh} aria-label="Refresh">
              <RefreshRounded />
            </IconButton>
          </Tooltip>
          <ThemeToggle />
        </Toolbar>
        <Box sx={{ height: 2 }}>{loading && <LinearProgress sx={{ height: 2 }} />}</Box>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={2.5}>
          <Paper sx={{ p: 2.5 }}>
            <Stack spacing={2.5}>
              <PeriodSelector value={view} onChange={(p) => update(p)} />
              <FilterBar
                meta={meta}
                groupBy={view.groupBy}
                includeNatVolume={view.includeNatVolume}
                includeAwsInternal={view.includeAwsInternal}
                filters={view.filters}
                onGroupBy={(groupBy) => update({ groupBy })}
                onIncludeNatVolume={(includeNatVolume) => update({ includeNatVolume })}
                onIncludeAwsInternal={setIncludeAwsInternal}
                onFilters={(filters) => update({ filters })}
                valueLabel={valueLabel}
              />
            </Stack>
          </Paper>

          {data && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Showing {rangeLabel(data.window.start, data.window.end)}
                {data.data_window && data.data_window.end !== data.window.end && ` (data through ${dayjs(data.data_window.end).format('MMM D')})`}
                {data.previous_window && ` · compared with ${rangeLabel(data.previous_window.start, data.previous_window.end)}`}
              </Typography>
              {data.estimated && (
                <Tooltip title="Cost Explorer marks recent data as estimated until the bill is finalised.">
                  <Chip size="small" variant="outlined" label="Includes estimated data" />
                </Tooltip>
              )}
            </Stack>
          )}

          {view.groupBy.startsWith('TAG:') && (
            <Alert severity="info" variant="outlined">
              Tag breakdowns only include resources carrying the <b>{view.groupBy.slice(4)}</b> cost allocation tag. Traffic on
              untagged resources appears as <i>(untagged)</i>. Cost Explorer has no native VPC dimension, so tag your NAT
              gateways, load balancers and instances with their VPC to break down by VPC.
            </Alert>
          )}

          <Box sx={{ opacity: loading && data ? 0.6 : 1, transition: 'opacity 150ms' }}>
            <Stack spacing={2.5}>
              <KpiCards data={data} groupLabel={groupLabel} />
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, lg: 8 }}>
                  <TrendChart data={data} title={`Data volume over time by ${groupLabel.toLowerCase()}`} />
                </Grid>
                <Grid size={{ xs: 12, lg: 4 }}>
                  <BreakdownChart data={data} title={`Share by ${groupLabel.toLowerCase()}`} />
                </Grid>
              </Grid>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, lg: 8 }}>
                  <VolumeChart data={data} directions={meta?.directions ?? {}} />
                </Grid>
                <Grid size={{ xs: 12, lg: 4 }}>
                  <VolumeShareChart data={data} directions={meta?.directions ?? {}} />
                </Grid>
              </Grid>
              <BreakdownTable
                data={data}
                loading={loading}
                groupLabel={groupLabel}
                drillHint={next ? dimLabel(meta, next).toLowerCase() : null}
                onDrill={drill}
              />
            </Stack>
          </Box>

          {meta && meta.tag_keys.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No cost allocation tags found. Activate tags (e.g. <code>vpc</code>) in the Billing console to break data volume down by VPC or team.
            </Typography>
          )}
          {!data && !loading && !error && (
            <Button onClick={() => setReloadToken((t) => t + 1)}>Load</Button>
          )}
        </Stack>
      </Container>

      <Snackbar open={!!error} autoHideDuration={8000} onClose={() => setError(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ maxWidth: 640 }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
