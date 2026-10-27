from datetime import date

from pydantic import BaseModel


class WindowOut(BaseModel):
    start: date
    end: date  # inclusive
    granularity: str


class Amount(BaseModel):
    cost: float = 0.0
    gb: float = 0.0


class Row(BaseModel):
    key: str
    label: str
    cost: float
    gb: float
    pct: float
    by_type: dict[str, float]  # cost per transfer type


class SeriesPoint(BaseModel):
    date: date
    values: dict[str, float]  # row key -> cost


class Summary(BaseModel):
    period: str
    window: WindowOut
    data_window: WindowOut | None  # portion of the window that can have data
    previous_window: WindowOut | None
    group_by: str
    metric: str
    include_discounts: bool
    include_nat_volume: bool  # NAT Gateway GB counted in volume figures (its cost always is)
    currency: str
    total_cost: float
    total_gb: float
    egress_gb: float  # GB of EGRESS_TYPES only: bytes leaving AWS or crossing regions
    prev_total_cost: float | None
    prev_total_gb: float | None
    prev_egress_gb: float | None
    by_type: dict[str, Amount]
    rows: list[Row]
    series: list[SeriesPoint]
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
    transit_types: list[str]  # transfer types that move data inside AWS rather than out of it
    group_by_options: list[Option]
    metrics: list[Option]
    default_tag_key: str | None
    mock: bool
