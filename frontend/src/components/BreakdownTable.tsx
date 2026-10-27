import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { Row, Summary } from '../api';
import { bytes, money, pct, rate } from '../format';
import { OTHER_COLOR, TRANSFER_TYPE_COLORS } from '../theme';

interface Props {
  data: Summary | null;
  loading: boolean;
  groupLabel: string;
  drillHint: string | null;
  onDrill: (row: Row) => void;
}

function MixBar({ row, currency }: { row: Row; currency: string }) {
  const parts = Object.entries(row.by_type).filter(([, v]) => v > 0);
  return (
    <Tooltip
      title={
        <Box>
          {parts.map(([t, v]) => (
            <div key={t}>
              {t}: {money(v, currency)}
            </div>
          ))}
        </Box>
      }
    >
      <Box sx={{ display: 'flex', height: 8, width: '100%', borderRadius: 4, overflow: 'hidden', gap: '1px' }}>
        {parts.map(([t, v]) => (
          <Box key={t} sx={{ width: `${(v / row.cost) * 100}%`, bgcolor: TRANSFER_TYPE_COLORS[t] ?? OTHER_COLOR }} />
        ))}
      </Box>
    </Tooltip>
  );
}

export default function BreakdownTable({ data, loading, groupLabel, drillHint, onDrill }: Props) {
  const currency = data?.currency ?? 'USD';
  const columns: GridColDef<Row>[] = [
    {
      field: 'label',
      headerName: groupLabel,
      flex: 1.4,
      minWidth: 200,
      renderCell: ({ row }) => (
        <Stack sx={{ justifyContent: 'center', height: '100%', lineHeight: 1.3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {row.label}
          </Typography>
          {row.label !== row.key && row.key !== '' && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.key}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      field: 'cost',
      headerName: 'Cost',
      type: 'number',
      flex: 0.7,
      minWidth: 110,
      valueFormatter: (v: number) => money(v, currency),
    },
    { field: 'gb', headerName: 'Volume', type: 'number', flex: 0.7, minWidth: 110, valueFormatter: (v: number) => bytes(v) },
    {
      field: 'rate',
      headerName: '$/GB',
      type: 'number',
      flex: 0.5,
      minWidth: 90,
      valueGetter: (_: unknown, row: Row) => (row.gb ? row.cost / row.gb : 0),
      valueFormatter: (v: number) => rate(v, currency),
    },
    {
      field: 'pct',
      headerName: 'Share',
      flex: 0.8,
      minWidth: 140,
      type: 'number',
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', height: '100%' }}>
          <LinearProgress variant="determinate" value={row.pct} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
          <Typography variant="body2" sx={{ width: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {pct(row.pct)}
          </Typography>
        </Stack>
      ),
    },
    {
      field: 'by_type',
      headerName: 'Transfer mix',
      flex: 0.9,
      minWidth: 140,
      sortable: false,
      filterable: false,
      disableExport: true,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <MixBar row={row} currency={currency} />
        </Box>
      ),
    },
  ];

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Breakdown by {groupLabel.toLowerCase()}
        </Typography>
        {drillHint && (
          <Typography variant="body2" color="text.secondary">
            Click a row to drill into {drillHint}
          </Typography>
        )}
      </Stack>
      <DataGrid
        rows={data?.rows ?? []}
        columns={columns}
        getRowId={(r) => r.key || '(empty)'}
        loading={loading && !data}
        autoHeight
        density="comfortable"
        disableRowSelectionOnClick
        showToolbar
        slotProps={{
          toolbar: { csvOptions: { fileName: `dto-by-${groupLabel.toLowerCase().replace(/\W+/g, '-')}` }, printOptions: { disableToolbarButton: true } },
        }}
        initialState={{
          sorting: { sortModel: [{ field: 'cost', sort: 'desc' }] },
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        onRowClick={({ row }) => drillHint && onDrill(row as Row)}
        sx={{
          border: 0,
          '& .MuiDataGrid-row': { cursor: drillHint ? 'pointer' : 'default' },
          '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
        }}
      />
    </Paper>
  );
}
