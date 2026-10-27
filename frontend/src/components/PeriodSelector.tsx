import dayjs, { type Dayjs } from 'dayjs';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import type { Period } from '../api';

const FMT = 'YYYY-MM-DD';

export interface PeriodValue {
  period: Period;
  anchor: string; // any date inside the week/month
  start: string; // custom range, inclusive
  end: string;
}

interface Props {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
}

export function periodBounds(value: PeriodValue): [Dayjs, Dayjs] {
  const a = dayjs(value.anchor);
  if (value.period === 'week') {
    const monday = a.subtract((a.day() + 6) % 7, 'day');
    return [monday, monday.add(6, 'day')];
  }
  if (value.period === 'month') return [a.startOf('month'), a.endOf('month')];
  return [dayjs(value.start), dayjs(value.end)];
}

const PRESETS: { label: string; range: () => [Dayjs, Dayjs] }[] = [
  { label: 'Last 7 days', range: () => [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] },
  { label: 'Last 30 days', range: () => [dayjs().subtract(30, 'day'), dayjs().subtract(1, 'day')] },
  { label: 'Last 90 days', range: () => [dayjs().subtract(90, 'day'), dayjs().subtract(1, 'day')] },
  { label: 'Year to date', range: () => [dayjs().startOf('year'), dayjs()] },
  { label: 'Last 12 months', range: () => [dayjs().subtract(12, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
];

export default function PeriodSelector({ value, onChange }: Props) {
  const [start, end] = periodBounds(value);
  const unit = value.period === 'week' ? 'week' : 'month';
  const canGoNext = start.add(1, unit).isBefore(dayjs().add(1, 'day'), 'day');

  const step = (n: number) => onChange({ ...value, anchor: dayjs(value.anchor).add(n, unit).format(FMT) });

  const setPeriod = (period: Period | null) => {
    if (!period) return;
    if (period === 'custom') {
      // Seed the custom range with whatever is currently on screen.
      onChange({ ...value, period, start: start.format(FMT), end: end.format(FMT) });
    } else {
      onChange({ ...value, period });
    }
  };

  const label =
    value.period === 'month'
      ? start.format('MMMM YYYY')
      : start.isSame(end, 'year')
        ? `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`
        : `${start.format('MMM D, YYYY')} – ${end.format('MMM D, YYYY')}`;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          color="primary"
          value={value.period}
          onChange={(_, p) => setPeriod(p)}
          aria-label="Period"
        >
          <ToggleButton value="week">Weekly</ToggleButton>
          <ToggleButton value="month">Monthly</ToggleButton>
          <ToggleButton value="custom">Custom</ToggleButton>
        </ToggleButtonGroup>

        {value.period !== 'custom' ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title={`Previous ${unit}`}>
              <IconButton size="small" onClick={() => step(-1)} aria-label={`Previous ${unit}`}>
                <ChevronLeftRounded />
              </IconButton>
            </Tooltip>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 190, textAlign: 'center' }}>
              {label}
            </Typography>
            <Tooltip title={`Next ${unit}`}>
              <span>
                <IconButton size="small" onClick={() => step(1)} disabled={!canGoNext} aria-label={`Next ${unit}`}>
                  <ChevronRightRounded />
                </IconButton>
              </span>
            </Tooltip>
            <DatePicker
              label={value.period === 'month' ? 'Jump to month' : 'Jump to week of'}
              views={value.period === 'month' ? ['year', 'month'] : ['year', 'month', 'day']}
              openTo={value.period === 'month' ? 'month' : 'day'}
              value={dayjs(value.anchor)}
              disableFuture
              onChange={(d) => d?.isValid() && onChange({ ...value, anchor: d.format(FMT) })}
              slotProps={{ textField: { size: 'small', sx: { width: 190 } } }}
            />
            <Button size="small" onClick={() => onChange({ ...value, anchor: dayjs().format(FMT) })}>
              {value.period === 'week' ? 'This week' : 'This month'}
            </Button>
          </Stack>
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <DatePicker
              label="From"
              value={dayjs(value.start)}
              maxDate={dayjs(value.end)}
              disableFuture
              onChange={(d) => d?.isValid() && onChange({ ...value, start: d.format(FMT) })}
              slotProps={{ textField: { size: 'small', sx: { width: { sm: 170 } } } }}
            />
            <DatePicker
              label="To"
              value={dayjs(value.end)}
              minDate={dayjs(value.start)}
              disableFuture
              onChange={(d) => d?.isValid() && onChange({ ...value, end: d.format(FMT) })}
              slotProps={{ textField: { size: 'small', sx: { width: { sm: 170 } } } }}
            />
          </Stack>
        )}
      </Stack>

      {value.period === 'custom' && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              size="small"
              variant="outlined"
              clickable
              onClick={() => {
                const [s, e] = p.range();
                onChange({ ...value, start: s.format(FMT), end: e.format(FMT) });
              }}
            />
          ))}
        </Box>
      )}
    </Stack>
  );
}
