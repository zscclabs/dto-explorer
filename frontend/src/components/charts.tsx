import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import type { Direction, Summary } from '../api';
import { bytes } from '../format';
import { OTHER_COLOR, TRANSFER_TYPE_COLORS, colorFor } from '../theme';

const TOP_N = 8;
const OTHER_KEY = '__other__';

interface Slice {
  key: string;
  label: string;
  color: string;
}

/** Top N groups by volume, plus an "Other" bucket for the rest. */
function slices(data: Summary): Slice[] {
  const rows = data.rows.filter((r) => r.gb > 0);
  const top = rows.slice(0, TOP_N).map((r, i) => ({ key: r.key, label: r.label, color: colorFor(data.group_by, r.key, i) }));
  if (rows.length > TOP_N) top.push({ key: OTHER_KEY, label: `Other (${rows.length - TOP_N})`, color: OTHER_COLOR });
  return top;
}

function Empty({ height }: { height: number }) {
  return (
    <Box sx={{ height, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
      <Typography variant="body2">No data transfer in this period.</Typography>
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
  // Plot in one unit chosen from the tallest bar so axis ticks land on round numbers.
  const peak = Math.max(0, ...data.series.map((p) => Object.values(p.values).reduce((s, v) => s + v, 0)));
  const [unit, divisor] = unitFor(peak);
  const fmt = (v: number | null) => (v == null ? '' : bytes(v * divisor));

  const series = groups.map((g) => ({
    id: g.key,
    label: g.label,
    color: g.color,
    stack: 'total',
    valueFormatter: fmt,
    data: data.series.map(
      (p) =>
        (g.key === OTHER_KEY
          ? Object.entries(p.values).reduce((sum, [k, v]) => (topKeys.has(k) ? sum : sum + v), 0)
          : (p.values[g.key] ?? 0)) / divisor,
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
          {groups.some((g) => g.key === OTHER_KEY) ? ' + other' : ''} · {unit}
        </Typography>
      </Stack>
      {data.series.length === 0 || data.total_gb === 0 ? (
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
    </Paper>
  );
}

/** A unit from the largest value so axis ticks land on round numbers: [label, GB per unit]. */
function unitFor(peakGb: number): [string, number] {
  return peakGb >= 1024 * 1024 ? ['PB', 1024 * 1024] : peakGb >= 1024 ? ['TB', 1024] : ['GB', 1];
}

/** Legend label that marks transit types, whose volume duplicates or doubles other traffic. */
function typeLabel(type: string, directions: Record<string, Direction>): string {
  return directions[type] === 'Transit' ? `${type} (transit)` : type;
}

export function VolumeChart({ data, directions }: { data: Summary | null; directions: Record<string, Direction> }) {
  const height = 300;
  if (!data) return <Skeleton variant="rounded" height={height + 76} />;

  const daily = data.window.granularity === 'DAILY';
  const labels = data.volume_series.map((p) => dayjs(p.date).format(daily ? 'MMM D' : 'MMM YYYY'));
  const types = Object.entries(data.by_type)
    .filter(([, gb]) => gb > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([t]) => t);
  const peak = Math.max(0, ...data.volume_series.map((p) => Object.values(p.values).reduce((s, v) => s + v, 0)));
  const [unit, divisor] = unitFor(peak);
  const fmt = (v: number | null) => (v == null ? '' : bytes(v * divisor));

  const series = types.map((t) => ({
    id: t,
    label: typeLabel(t, directions),
    color: TRANSFER_TYPE_COLORS[t] ?? OTHER_COLOR,
    stack: 'total',
    valueFormatter: fmt,
    data: data.volume_series.map((p) => (p.values[t] ?? 0) / divisor),
  }));

  return (
    <Paper sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Data volume over time by transfer type
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
      {types.some((t) => directions[t] === 'Transit') && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          Transit types move data inside AWS. Inter-AZ is billed on both the sending and receiving side, so it shows about
          2× the bytes moved.{' '}
          {data.include_nat_volume
            ? 'NAT Gateway volume duplicates the traffic it carries.'
            : 'NAT Gateway volume is left out because it duplicates the traffic it carries (switch: Include NAT volume).'}
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
    value: g.key === OTHER_KEY ? data.rows.filter((r) => !topKeys.has(r.key)).reduce((s, r) => s + r.gb, 0) : data.rows.find((r) => r.key === g.key)!.gb,
  }));

  return <Donut title={title} items={items} height={height} format={bytes} />;
}

export function VolumeShareChart({ data, directions }: { data: Summary | null; directions: Record<string, Direction> }) {
  const height = 300;
  if (!data) return <Skeleton variant="rounded" height={height + 76} />;

  const items = Object.entries(data.by_type)
    .filter(([, gb]) => gb > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([t, gb]) => ({ id: t, label: typeLabel(t, directions), color: TRANSFER_TYPE_COLORS[t] ?? OTHER_COLOR, value: gb }));

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
