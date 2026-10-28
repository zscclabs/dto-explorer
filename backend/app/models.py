from datetime import date

from pydantic import BaseModel


class WindowOut(BaseModel):
    start: date
    end: date  # inclusive
    granularity: str


class Row(BaseModel):
    key: str
    label: str
    gb: float
    pct: float  # share of total_gb
    by_type: dict[str, float]  # GB per transfer type


class SeriesPoint(BaseModel):
    date: date
    values: dict[str, float]  # row key or transfer type -> GB


class Summary(BaseModel):
    period: str
    window: WindowOut
    data_window: WindowOut | None  # portion of the window that can have data
    previous_window: WindowOut | None
    group_by: str
    include_nat_volume: bool  # NAT Gateway GB counted (it duplicates the traffic it carries)
    total_gb: float
    egress_gb: float  # direction Out: leaving AWS or crossing regions
    ingress_gb: float  # direction In: arriving from the internet or another region
    transit_gb: float  # moving inside AWS (Inter-AZ, NAT Gateway, To CloudFront)
    prev_total_gb: float | None
    prev_egress_gb: float | None
    prev_ingress_gb: float | None
    prev_transit_gb: float | None
    by_type: dict[str, float]  # GB per transfer type
    rows: list[Row]
    series: list[SeriesPoint]  # row key -> GB
    volume_series: list[SeriesPoint]  # transfer type -> GB
    estimated: bool
    mock: bool


class Option(BaseModel):
    value: str
    label: str


class Meta(BaseModel):
    accounts: list[Option]
    regions: list[Option]
    services: list[str]
    tag_keys: list[str]
    cost_categories: list[str]
    transfer_types: list[str]
    directions: dict[str, str]  # transfer type -> Out, In or Transit
    group_by_options: list[Option]
    default_tag_key: str | None
    mock: bool
