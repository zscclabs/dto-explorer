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
import { bytes, deltaPct, pct, rangeLabel } from '../format';
import { OTHER_COLOR, TRANSFER_TYPE_COLORS } from '../theme';

function Delta({ value, previousLabel }: { value: number | null; previousLabel: string }) {
  if (value === null) return null;
  // More traffic usually means more spend, so going up is flagged.
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
  const top = data.rows[0];
  const mix = Object.entries(data.by_type).filter(([, gb]) => gb > 0);
  const internetOnly = !data.include_aws_internal;
  const tiles = [
    {
      title: internetOnly ? 'Internet egress' : 'Egress',
      gb: data.egress_gb,
      prev: data.prev_egress_gb,
      help: internetOnly
        ? 'Out to the internet (Internet Out, Other Out).'
        : 'Out: leaving AWS to the internet or crossing regions (Internet Out, Inter-Region Out, Other Out).',
    },
    {
      title: internetOnly ? 'Internet ingress' : 'Ingress',
      gb: data.ingress_gb,
      prev: data.prev_ingress_gb,
      help: internetOnly
        ? 'In from the internet (Internet In, Other In). AWS does not charge for it.'
        : 'In: arriving from the internet or another region (Internet In, Inter-Region In, Other In). AWS does not charge for it.',
    },
  ];
  // Transit is empty while both traffic within AWS and NAT volume are left out.
  if (data.include_aws_internal || data.include_nat_volume) {
    const parts = [
      ...(data.include_aws_internal ? ['Inter-AZ (counted on both sides, so about 2x the bytes moved)', 'To CloudFront'] : []),
      ...(data.include_nat_volume ? ['NAT Gateway'] : []),
    ];
    tiles.push({
      title: 'Transit inside AWS',
      gb: data.transit_gb,
      prev: data.prev_transit_gb,
      help: `${parts.join(', ')}. These bytes also appear under another type.`,
    });
  }
  const size = { xs: 12, sm: 6, lg: 12 / (tiles.length + 1) };

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        {tiles.map((t) => (
          <Grid key={t.title} size={size}>
            <Kpi
              title={t.title}
              value={bytes(t.gb)}
              delta={<Delta value={deltaPct(t.gb, t.prev)} previousLabel={prevLabel} />}
              sub={
                <Tooltip title={t.help}>
                  <span>{t.prev !== null ? `${bytes(t.prev)} previous period` : 'No data in range'}</span>
                </Tooltip>
              }
            />
          </Grid>
        ))}
        <Grid size={size}>
          <Kpi
            title={`Top ${groupLabel.toLowerCase()}`}
            value={
              <Box component="span" sx={{ display: 'block', fontSize: '1.5rem', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {top?.label ?? '—'}
              </Box>
            }
            sub={top ? `${bytes(top.gb)} · ${pct(top.pct)} of total` : undefined}
          />
        </Grid>
      </Grid>

      {mix.length > 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Transfer type mix · {bytes(data.total_gb)}
          </Typography>
          <Box sx={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: '2px' }}>
            {mix.map(([type, gb]) => (
              <Tooltip key={type} title={`${type}: ${bytes(gb)}`}>
                <Box sx={{ width: `${(gb / data.total_gb) * 100}%`, bgcolor: TRANSFER_TYPE_COLORS[type] ?? OTHER_COLOR, minWidth: 3 }} />
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3, rowGap: 1, mt: 1.5 }}>
            {mix.map(([type, gb]) => (
              <Stack key={type} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: TRANSFER_TYPE_COLORS[type] ?? OTHER_COLOR }} />
                <Typography variant="body2" color="text.secondary">
                  {type}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {bytes(gb)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ({pct((gb / data.total_gb) * 100)})
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
