import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import FilterAltOffRounded from '@mui/icons-material/FilterAltOffRounded';
import type { Filters, Meta, Option } from '../api';
import { TRANSFER_TYPE_COLORS } from '../theme';

interface Props {
  meta: Meta | null;
  groupBy: string;
  metric: string;
  includeDiscounts: boolean;
  includeNatVolume: boolean;
  filters: Filters;
  onGroupBy: (value: string) => void;
  onMetric: (value: string) => void;
  onIncludeDiscounts: (value: boolean) => void;
  onIncludeNatVolume: (value: boolean) => void;
  onFilters: (value: Filters) => void;
  valueLabel: (dim: string, value: string) => string;
}

const MAIN_DIMS = ['LINKED_ACCOUNT', 'REGION', 'TRANSFER_TYPE'];

export function dimLabel(meta: Meta | null, dim: string): string {
  return meta?.group_by_options.find((o) => o.value === dim)?.label ?? dim;
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
  colors,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  colors?: Record<string, string>;
}) {
  const selected = options.filter((o) => value.includes(o.value));
  return (
    <Autocomplete
      multiple
      size="small"
      limitTags={2}
      options={options}
      value={selected}
      disableCloseOnSelect
      isOptionEqualToValue={(a, b) => a.value === b.value}
      getOptionLabel={(o) => o.label}
      onChange={(_, v) => onChange(v.map((o) => o.value))}
      renderOption={(props, o) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            {colors && <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: colors[o.value], mr: 1.5 }} />}
            <Box>
              {o.label}
              {o.label !== o.value && (
                <Box component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: 12 }}>
                  {o.value}
                </Box>
              )}
            </Box>
          </li>
        );
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder={value.length ? '' : 'All'} />}
      sx={{ minWidth: 220, flex: 1 }}
    />
  );
}

export default function FilterBar({
  meta,
  groupBy,
  metric,
  includeDiscounts,
  includeNatVolume,
  filters,
  onGroupBy,
  onMetric,
  onIncludeDiscounts,
  onIncludeNatVolume,
  onFilters,
  valueLabel,
}: Props) {
  const setDim = (dim: string, values: string[]) => {
    const next = { ...filters };
    if (values.length) next[dim] = values;
    else delete next[dim];
    onFilters(next);
  };

  const extra = Object.entries(filters).filter(([dim]) => !MAIN_DIMS.includes(dim));
  const anyFilters = Object.keys(filters).length > 0;
  const groupOptions = meta?.group_by_options ?? [{ value: 'REGION', label: 'Region' }];
  const dims = groupOptions.filter((o) => !o.value.includes(':'));
  const tagged = groupOptions.filter((o) => o.value.includes(':'));

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="group-by">Break down by</InputLabel>
          <Select labelId="group-by" label="Break down by" value={groupBy} onChange={(e) => onGroupBy(e.target.value)}>
            {dims.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
            {tagged.length > 0 && <ListSubheader>Tags &amp; cost categories (e.g. VPC)</ListSubheader>}
            {tagged.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <MultiSelect
          label="Accounts"
          options={meta?.accounts ?? []}
          value={filters.LINKED_ACCOUNT ?? []}
          onChange={(v) => setDim('LINKED_ACCOUNT', v)}
        />
        <MultiSelect
          label="Regions"
          options={meta?.regions ?? []}
          value={filters.REGION ?? []}
          onChange={(v) => setDim('REGION', v)}
        />
        <MultiSelect
          label="Transfer types"
          options={(meta?.transfer_types ?? []).map((t) => ({ value: t, label: t }))}
          value={filters.TRANSFER_TYPE ?? []}
          onChange={(v) => setDim('TRANSFER_TYPE', v)}
          colors={TRANSFER_TYPE_COLORS}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="metric">Cost metric</InputLabel>
          <Select labelId="metric" label="Cost metric" value={metric} onChange={(e) => onMetric(e.target.value)}>
            {(meta?.metrics ?? [{ value: 'UnblendedCost', label: 'Unblended cost' }]).map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack sx={{ justifyContent: 'center' }}>
          <Tooltip title="Off: list-price usage charges only, so every breakdown adds up to 100%. On: net of credits, refunds and EDP / private-rate discounts, which AWS books as negative charges and can show as negative groups.">
            <FormControlLabel
              control={<Switch checked={includeDiscounts} onChange={(e) => onIncludeDiscounts(e.target.checked)} />}
              label="Include discounts & credits"
              sx={{ whiteSpace: 'nowrap', mr: 0 }}
            />
          </Tooltip>
          <Tooltip title="NAT Gateway bytes are a processing fee on traffic that is already billed as Internet Out, Inter-Region or Inter-AZ. Off: NAT cost is counted but its volume is not, so data isn't double-counted. On: add NAT volume back to see how much data goes through NAT gateways.">
            <FormControlLabel
              control={<Switch checked={includeNatVolume} onChange={(e) => onIncludeNatVolume(e.target.checked)} />}
              label="Include NAT volume"
              sx={{ whiteSpace: 'nowrap', mr: 0 }}
            />
          </Tooltip>
        </Stack>
      </Stack>

      {(extra.length > 0 || anyFilters) && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
          {extra.flatMap(([dim, values]) =>
            values.map((v) => (
              <Chip
                key={`${dim}=${v}`}
                size="small"
                color="primary"
                variant="outlined"
                label={`${dimLabel(meta, dim)}: ${valueLabel(dim, v)}`}
                onDelete={() => setDim(dim, values.filter((x) => x !== v))}
              />
            )),
          )}
          {anyFilters && (
            <Button size="small" startIcon={<FilterAltOffRounded />} onClick={() => onFilters({})}>
              Clear filters
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
