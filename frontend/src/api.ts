export type Period = 'week' | 'month' | 'custom';
export type Filters = Record<string, string[]>;
export type Direction = 'Out' | 'In' | 'Transit';

export interface Option {
  value: string;
  label: string;
}

export interface Meta {
  accounts: Option[];
  regions: Option[];
  services: string[];
  tag_keys: string[];
  cost_categories: string[];
  transfer_types: string[];
  aws_internal_types: string[]; // hidden unless includeAwsInternal
  directions: Record<string, Direction>; // transfer type -> direction
  group_by_options: Option[];
  default_tag_key: string | null;
  mock: boolean;
}

export interface Window {
  start: string;
  end: string;
  granularity: 'DAILY' | 'MONTHLY';
}

export interface Row {
  key: string;
  label: string;
  gb: number;
  pct: number; // share of total_gb
  by_type: Record<string, number>; // transfer type -> GB
}

export interface Summary {
  period: Period;
  window: Window;
  data_window: Window | null;
  previous_window: Window | null;
  group_by: string;
  include_nat_volume: boolean;
  include_aws_internal: boolean; // Inter-AZ, Inter-Region and To CloudFront counted
  total_gb: number;
  egress_gb: number; // Out: leaving AWS or crossing regions
  ingress_gb: number; // In: arriving from the internet or another region
  transit_gb: number; // moving inside AWS
  prev_total_gb: number | null;
  prev_egress_gb: number | null;
  prev_ingress_gb: number | null;
  prev_transit_gb: number | null;
  by_type: Record<string, number>; // transfer type -> GB
  rows: Row[];
  series: { date: string; values: Record<string, number> }[]; // row key -> GB
  volume_series: { date: string; values: Record<string, number> }[]; // transfer type -> GB
  estimated: boolean;
  mock: boolean;
}

export interface Query {
  period: Period;
  start?: string;
  end?: string;
  groupBy: string;
  includeNatVolume: boolean;
  includeAwsInternal: boolean;
  filters: Filters;
}

export function toSearchParams(q: Query): URLSearchParams {
  const p = new URLSearchParams({ period: q.period, group_by: q.groupBy });
  if (q.start) p.set('start', q.start);
  if (q.end && q.period === 'custom') p.set('end', q.end);
  if (q.includeNatVolume) p.set('include_nat_volume', 'true');
  if (q.includeAwsInternal) p.set('include_aws_internal', 'true');
  for (const [dim, values] of Object.entries(q.filters)) {
    for (const v of values) p.append('filter', `${dim}=${v}`);
  }
  return p;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const fetchMeta = (signal?: AbortSignal) => getJson<Meta>('/api/meta', signal);

export const fetchSummary = (q: Query, signal?: AbortSignal) =>
  getJson<Summary>(`/api/dto/summary?${toSearchParams(q)}`, signal);

export const exportUrl = (q: Query) => `/api/dto/export.csv?${toSearchParams(q)}`;
