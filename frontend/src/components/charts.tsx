import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import type { Summary } from '../api';
import { bytes, money } from '../format';
import { OTHER_COLOR, TRANSFER_TYPE_COLORS, colorFor } from '../theme';

const TOP_N = 8;
const OTHER_KEY = '__other__';

interface Slice {
  key: string;
  label: string;
  color: string;
}

/** Top N groups by cost, plus an "Other" bucket for the rest. */
function slices(data: Summary): Slice[] {
  // Zero-cost groups (e.g. free transfer to CloudFront) stay in the table but add only legend noise here.
  const rows = data.rows.filter((r) => r.cost > 0);
  const top = rows.slice(0, TOP_N).map((r, i) => ({ key: r.key, label: r.label, color: colorFor(data.group_by, r.key, i) }));
  if (rows.length > TOP_N) top.push({ key: OTHER_KEY, label: `Other (${rows.length - TOP_N})`, color: OTHER_COLOR });
  return top;
}

function Empty({ height }: { height: number }) {
  return (
    <Box sx={{ height, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
      <Typography variant="body2">No data transfer charges in this period.</Typography>
    </Box>
  );
}

export function TrendChart({ data, title }: { data: Summary | null; title: string }) {
  const height = 340;
  if (!data) return <Skeleton variant="rounded" height={height + 56} />;

  const groups = slices(data);
  const topKeys = new Set(groups.map((g) => g.key));
  const daily = data.window.granularity === 'DAILY';
  const labels = data.series.map((p) => dayjs(p.date).format(daily ? 'MMM D' : 'MMM YYYY'));
  const fmt = (v: number | null) => (v == null ? '' : money(v, data.currency));

  const series = groups.map((g) => ({
    id: g.key,
    label: g.label,
    color: g.color,
    stack: 'total',
    valueFormatter: fmt,
    data: data.series.map((p) =>
      g.key === OTHER_KEY
        ? Object.entries(p.values).reduce((sum, [k, v]) => (topKeys.has(k) ? sum : sum + v), 0)
        : (p.values[g.key] ?? 0),
    ),
  }));

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {daily ? 'Daily' : 'Monthly'} · top {groups.filter((g) => g.key !== OTHER_KEY).length}
          {groups.some((g) => g.key === OTHER_KEY) ? ' + other' : ''}
        </Typography>
      </Stack>
      {data.series.length === 0 || data.total_cost === 0 ? (
        <Empty height={height} />
      ) : (
        <BarChart
          height={height}
          series={series}
          xAxis={[{ scaleType: 'band', data: labels, tickLabelStyle: { fontSize: 11 } }]}
          yAxis={[{ valueFormatter: (v: number) => money(v, data.currency, true), width: 64 }]}
          margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
          slotProps={{ legend: { position: { vertical: 'bottom', horizontal: 'center' } } }}
          borderRadius={4}
        />
      )}
    </Paper>
  );
}

export function VolumeChart({ data }: { data: Summary | null }) {
  const height = 300;
  if (!data) return <Skeleton variant="rounded" height={height + 76} />;

  const daily = data.window.granularity === 'DAILY';
  const labels = data.volume_series.map((p) => dayjs(p.date).format(daily ? 'MMM D' : 'MMM YYYY'));
  // Unlike cost, free transfer (e.g. to CloudFront) still has volume, so key off GB here.
  const types = Object.entries(data.by_type)
    .filter(([, a]) => a.gb > 0)
    .sort(([, a], [, b]) => b.gb - a.gb)
    .map(([t]) => t);
  // Plot in one unit chosen from the tallest bar so axis ticks land on round numbers.
  const peak = Math.max(0, ...data.volume_series.map((p) => Object.values(p.values).reduce((s, v) => s + v, 0)));
  const [unit, divisor] = peak >= 1024 * 1024 ? ['PB', 1024 * 1024] : peak >= 1024 ? ['TB', 1024] : ['GB', 1];
  const fmt = (v: number | null) => (v == null ? '' : bytes(v * divisor));

  const series = types.map((t) => ({
    id: t,
    label: t,
    color: TRANSFER_TYPE_COLORS[t] ?? OTHER_COLOR,
    stack: 'total',
    valueFormatter: fmt,
    data: data.volume_series.map((p) => (p.values[t] ?? 0) / divisor),
  }));

  return (
    <Paper sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          DTO data volume over time by transfer type
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {daily ? 'Daily' : 'Monthly'} · {unit}
        </Typography>
      </Stack>
      {types.length === 0 ? (
        <Empty height={height} />
      ) : (
        <BarChart
          height={height}
          series={series}
          xAxis={[{ scaleType: 'band', data: labels, tickLabelStyle: { fontSize: 11 } }]}
          yAxis={[{ valueFormatter: (v: number) => `${v.toLocaleString()} ${unit}`, width: 72 }]}
          margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
          slotProps={{ legend: { position: { vertical: 'bottom', horizontal: 'center' } } }}
          borderRadius={4}
        />
      )}
      {types.includes('NAT Gateway') && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          NAT Gateway volume is data processed by the gateway; traffic leaving through it to the internet is also counted
          under Internet Out.
        </Typography>
      )}
    </Paper>
  );
}

export function BreakdownChart({ data, title }: { data: Summary | null; title: string }) {
  const height = 340;
  if (!data) return <Skeleton variant="rounded" height={height + 56} />;

  const groups = slices(data);
  const topKeys = new Set(groups.map((g) => g.key));
  const items = groups.map((g) => ({
    id: g.key,
    label: g.label,
    color: g.color,
    value: g.key === OTHER_KEY ? data.rows.filter((r) => !topKeys.has(r.key)).reduce((s, r) => s + r.cost, 0) : data.rows.find((r) => r.key === g.key)!.cost,
  }));

  return <Donut title={title} items={items} height={height} format={(v) => money(v, data.currency)} />;
}

export function VolumeShareChart({ data }: { data: Summary | null }) {
  const height = 300;
  if (!data) return <Skeleton variant="rounded" height={height + 76} />;

  const items = Object.entries(data.by_type)
    .filter(([, a]) => a.gb > 0)
    .sort(([, a], [, b]) => b.gb - a.gb)
    .map(([t, a]) => ({ id: t, label: t, color: TRANSFER_TYPE_COLORS[t] ?? OTHER_COLOR, value: a.gb }));

  return <Donut title="Data volume share by transfer type" items={items} height={height} format={bytes} />;
}

interface DonutItem {
  id: string;
  label: string;
  color: string;
  value: number;
}

function Donut({ title, items, height, format }: { title: string; items: DonutItem[]; height: number; format: (v: number) => string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <Paper sx={{ p: 2.5, height: '100%' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {total === 0 ? (
        <Empty height={height} />
      ) : (
        <PieChart
          height={height}
          series={[
            {
              data: items,
              innerRadius: 72,
              outerRadius: 118,
              paddingAngle: 1.5,
              cornerRadius: 5,
              highlightScope: { fade: 'global', highlight: 'item' },
              valueFormatter: (item) => `${format(item.value)} (${((item.value / total) * 100).toFixed(1)}%)`,
            },
          ]}
          slotProps={{ legend: { direction: 'vertical', position: { vertical: 'middle', horizontal: 'end' } } }}
        />
      )}
    </Paper>
  );
}
