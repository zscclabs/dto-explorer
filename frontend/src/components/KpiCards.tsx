import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TrendingDownRounded from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import type { Summary } from '../api';
import { bytes, deltaPct, money, pct, rangeLabel, rate } from '../format';
import { OTHER_COLOR, TRANSFER_TYPE_COLORS } from '../theme';

function Delta({ value, previousLabel }: { value: number | null; previousLabel: string }) {
  if (value === null) return null;
  // For spend, going up is bad.
  const up = value >= 0;
  return (
    <Tooltip title={`vs ${previousLabel}`}>
      <Chip
        size="small"
        icon={up ? <TrendingUpRounded /> : <TrendingDownRounded />}
        label={`${up ? '+' : ''}${value.toFixed(1)}%`}
        color={Math.abs(value) < 1 ? 'default' : up ? 'error' : 'success'}
        variant="outlined"
        sx={{ borderRadius: 2 }}
      />
    </Tooltip>
  );
}

function Kpi({ title, value, sub, delta }: { title: string; value: ReactNode; sub?: ReactNode; delta?: ReactNode }) {
  return (
    <Paper sx={{ p: 2.5, height: '100%' }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="div" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
        {delta}
      </Stack>
      {sub && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

export default function KpiCards({ data, groupLabel }: { data: Summary | null; groupLabel: string }) {
  if (!data) {
    return (
      <Grid container spacing={2}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Skeleton variant="rounded" height={124} />
          </Grid>
        ))}
      </Grid>
    );
  }

  const prevLabel = data.previous_window ? rangeLabel(data.previous_window.start, data.previous_window.end) : '';
  // NAT cost has no counted volume unless NAT volume is included, so leave it out of $/GB.
  const natCost = data.include_nat_volume ? 0 : (data.by_type['NAT Gateway']?.cost ?? 0);
  const perGb = data.total_gb ? (data.total_cost - natCost) / data.total_gb : 0;
  const egressDelta = deltaPct(data.egress_gb, data.prev_egress_gb);
  const top = data.rows[0];
  const mix = Object.entries(data.by_type).filter(([, a]) => a.cost > 0);

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi
            title="Total DTO cost"
            value={money(data.total_cost, data.currency)}
            delta={<Delta value={deltaPct(data.total_cost, data.prev_total_cost)} previousLabel={prevLabel} />}
            sub={data.prev_total_cost !== null ? `${money(data.prev_total_cost, data.currency)} previous period` : 'No data in range'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi
            title="Data transferred"
            value={bytes(data.total_gb)}
            delta={<Delta value={deltaPct(data.total_gb, data.prev_total_gb)} previousLabel={prevLabel} />}
            sub={
              <Tooltip title="Egress: Internet Out, Inter-Region and Other Out. The rest is transit inside AWS.">
                <span>
                  {bytes(data.egress_gb)} leaving AWS
                  {egressDelta !== null && ` (${egressDelta >= 0 ? '+' : ''}${egressDelta.toFixed(1)}%)`}
                </span>
              </Tooltip>
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi title="Effective rate" value={rate(perGb, data.currency)} sub={`per GB · ${money(perGb * 1024, data.currency)} per TB`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi
            title={`Top ${groupLabel.toLowerCase()}`}
            value={
              <Box component="span" sx={{ display: 'block', fontSize: '1.5rem', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {top?.label ?? '—'}
              </Box>
            }
            sub={top ? `${money(top.cost, data.currency)} · ${pct(top.pct)} of total` : undefined}
          />
        </Grid>
      </Grid>

      {mix.length > 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Transfer type mix
          </Typography>
          <Box sx={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: '2px' }}>
            {mix.map(([type, a]) => (
              <Tooltip key={type} title={`${type}: ${money(a.cost, data.currency)} · ${type === 'NAT Gateway' && !data.include_nat_volume ? 'volume not counted' : bytes(a.gb)}`}>
                <Box sx={{ width: `${(a.cost / data.total_cost) * 100}%`, bgcolor: TRANSFER_TYPE_COLORS[type] ?? OTHER_COLOR, minWidth: 3 }} />
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3, rowGap: 1, mt: 1.5 }}>
            {mix.map(([type, a]) => (
              <Stack key={type} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: TRANSFER_TYPE_COLORS[type] ?? OTHER_COLOR }} />
                <Typography variant="body2" color="text.secondary">
                  {type}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {money(a.cost, data.currency)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ({pct((a.cost / data.total_cost) * 100)})
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
