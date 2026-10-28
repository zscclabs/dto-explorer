"""Data transfer volume discovery, classification and aggregation on top of Cost Explorer."""

import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from . import periods
from .cache import Cache
from .ce_client import CostExplorer
from .models import Meta, Option, Row, SeriesPoint, Summary, WindowOut

INTERNET_OUT = "Internet Out"
INTER_REGION_OUT = "Inter-Region Out"
OTHER_OUT = "Other Out"
INTERNET_IN = "Internet In"
INTER_REGION_IN = "Inter-Region In"
OTHER_IN = "Other In"
INTER_AZ = "Inter-AZ"
NAT_GATEWAY = "NAT Gateway"
TO_CLOUDFRONT = "To CloudFront"

OUT = "Out"
IN = "In"
TRANSIT = "Transit"
DIRECTIONS = [OUT, IN, TRANSIT]
# Out: bytes leaving AWS or crossing regions. In: bytes arriving from the internet or another region.
# Transit moves data inside AWS and its bytes reappear under another type: NAT data processing and origin
# fetches to CloudFront duplicate the traffic they carry, and Inter-AZ is billed on both the sending and the
# receiving side.
DIRECTION = {
    INTERNET_OUT: OUT,
    INTER_REGION_OUT: OUT,
    OTHER_OUT: OUT,
    INTERNET_IN: IN,
    INTER_REGION_IN: IN,
    OTHER_IN: IN,
    INTER_AZ: TRANSIT,
    NAT_GATEWAY: TRANSIT,
    TO_CLOUDFRONT: TRANSIT,
}
TRANSFER_TYPES = list(DIRECTION)

# Usage types are "<region prefix>-<kind>", the prefix is omitted for some us-east-1 usage.
_P = r"(?:[A-Z0-9]+-)?"
_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(rf"^{_P}DataTransfer-Regional-Bytes$"), INTER_AZ),
    (re.compile(rf"^{_P}NatGateway-Bytes$"), NAT_GATEWAY),
    (re.compile(r"^[A-Z0-9]+-[A-Z0-9]+-AWS-Out-A?Bytes$"), INTER_REGION_OUT),
    (re.compile(r"^[A-Z0-9]+-[A-Z0-9]+-AWS-In-A?Bytes$"), INTER_REGION_IN),
    (re.compile(rf"^{_P}CloudFront-Out-Bytes$"), TO_CLOUDFRONT),
    # Also matches CloudFront edge egress (e.g. "US-DataTransfer-Out-Bytes"), which is internet egress too.
    (re.compile(rf"^{_P}DataTransfer-Out-Bytes$"), INTERNET_OUT),
    (re.compile(rf"^{_P}DataTransfer-In-Bytes$"), INTERNET_IN),
]

# Substrings used to discover candidate usage types via GetDimensionValues.
_SEARCH_STRINGS = ["DataTransfer", "Out-Bytes", "Out-OBytes", "Out-ABytes", "In-Bytes", "In-OBytes", "In-ABytes", "NatGateway-Bytes"]

DIMENSIONS = {
    "REGION": "Region",
    "LINKED_ACCOUNT": "Account",
    "SERVICE": "Service",
    "TRANSFER_TYPE": "Transfer type",
    "DIRECTION": "Direction",
    "USAGE_TYPE": "Usage type",
}
UNTAGGED = "(untagged)"

REGION_NAMES = {
    "us-east-1": "US East (N. Virginia)",
    "us-east-2": "US East (Ohio)",
    "us-west-1": "US West (N. California)",
    "us-west-2": "US West (Oregon)",
    "ca-central-1": "Canada (Central)",
    "ca-west-1": "Canada West (Calgary)",
    "sa-east-1": "South America (São Paulo)",
    "mx-central-1": "Mexico (Central)",
    "eu-west-1": "Europe (Ireland)",
    "eu-west-2": "Europe (London)",
    "eu-west-3": "Europe (Paris)",
    "eu-central-1": "Europe (Frankfurt)",
    "eu-central-2": "Europe (Zurich)",
    "eu-north-1": "Europe (Stockholm)",
    "eu-south-1": "Europe (Milan)",
    "eu-south-2": "Europe (Spain)",
    "me-south-1": "Middle East (Bahrain)",
    "me-central-1": "Middle East (UAE)",
    "il-central-1": "Israel (Tel Aviv)",
    "af-south-1": "Africa (Cape Town)",
    "ap-east-1": "Asia Pacific (Hong Kong)",
    "ap-south-1": "Asia Pacific (Mumbai)",
    "ap-south-2": "Asia Pacific (Hyderabad)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "ap-northeast-2": "Asia Pacific (Seoul)",
    "ap-northeast-3": "Asia Pacific (Osaka)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ap-southeast-3": "Asia Pacific (Jakarta)",
    "ap-southeast-4": "Asia Pacific (Melbourne)",
    "ap-southeast-5": "Asia Pacific (Malaysia)",
    "ap-southeast-7": "Asia Pacific (Thailand)",
    "global": "Global",
    "NoRegion": "No region",
}


class DtoQueryError(ValueError):
    """Invalid request parameters."""


def classify(usage_type: str) -> str | None:
    """Map a usage type to a transfer type, or None when it is not data transfer."""
    for pattern, kind in _RULES:
        if pattern.match(usage_type):
            return kind
    if any(s in usage_type for s in ("Out-Bytes", "Out-OBytes", "Out-ABytes")):
        return OTHER_OUT
    if any(s in usage_type for s in ("In-Bytes", "In-OBytes", "In-ABytes")):
        return OTHER_IN
    return None


def counted_gb(kind: str, gb: float, include_nat_volume: bool) -> float:
    """Volume to count for a group: NAT bytes are a processing fee on traffic billed elsewhere, so 0 unless asked for."""
    return gb if include_nat_volume or kind != NAT_GATEWAY else 0.0


def parse_filters(raw: list[str]) -> dict[str, list[str]]:
    """Parse repeated `DIM=value` strings into {DIM: [values]} (OR within, AND across)."""
    out: dict[str, list[str]] = defaultdict(list)
    for item in raw:
        dim, sep, value = item.partition("=")
        if not sep:
            raise DtoQueryError(f"filter must look like DIM=value: {item!r}")
        _validate_dimension(dim)
        out[dim].append(value)
    return dict(out)


def _validate_dimension(dim: str) -> None:
    if dim in DIMENSIONS:
        return
    prefix, _, name = dim.partition(":")
    if prefix in ("TAG", "COST_CATEGORY") and name:
        return
    raise DtoQueryError(f"unsupported dimension: {dim!r}")


def _split_group_value(value: str) -> str:
    """Tag and cost category group keys come back as 'key$value'."""
    return value.split("$", 1)[1] if "$" in value else value


def _keyed_filter(kind: str, key: str, values: list[str]) -> dict[str, Any]:
    """Tag / cost category filter where '' means 'not set'."""
    present = [v for v in values if v != ""]
    parts: list[dict[str, Any]] = []
    if present:
        parts.append({kind: {"Key": key, "Values": present}})
    if len(present) != len(values):
        parts.append({kind: {"Key": key, "MatchOptions": ["ABSENT"]}})
    return parts[0] if len(parts) == 1 else {"Or": parts}


def _and(parts: list[dict[str, Any]]) -> dict[str, Any]:
    return parts[0] if len(parts) == 1 else {"And": parts}


def _by_direction(by_type: dict[str, float]) -> tuple[float, float, float]:
    """(out, in, transit) GB from GB per transfer type."""
    totals = defaultdict(float)
    for kind, gb in by_type.items():
        totals[DIRECTION[kind]] += gb
    return totals[OUT], totals[IN], totals[TRANSIT]


def _window_out(w: periods.Window) -> WindowOut:
    return WindowOut(start=w.start, end=w.last_day, granularity=w.granularity)


class DtoService:
    def __init__(self, ce: CostExplorer, cache: Cache, mock: bool = False):
        self.ce = ce
        self.cache = cache
        self.mock = mock

    # ---- discovery -------------------------------------------------------

    def dto_usage_types(self, start: date, end: date) -> dict[str, str]:
        """All outbound-transfer usage types with data in the window, mapped to transfer type."""

        def load() -> dict[str, str]:
            found: dict[str, str] = {}
            for s in _SEARCH_STRINGS:
                for v in self.ce.dimension_values("USAGE_TYPE", start, end, search=s):
                    kind = classify(v["Value"])
                    if kind:
                        found[v["Value"]] = kind
            return found

        return self.cache.get_or_set(("usage_types", start, end), load)

    def _account_names(self) -> dict[str, str]:
        return {o.value: o.label for o in self.meta().accounts}

    # ---- summary ---------------------------------------------------------

    def summary(
        self,
        period: periods.PeriodKind,
        start: date | None,
        end: date | None,
        group_by: str,
        filters: dict[str, list[str]],
        include_nat_volume: bool = False,
        today: date | None = None,
    ) -> Summary:
        _validate_dimension(group_by)
        try:
            resolved = periods.resolve(period, start, end, today=today)
        except ValueError as e:
            raise DtoQueryError(str(e)) from e

        key = ("summary", period, resolved.display, group_by, tuple(sorted((k, tuple(sorted(v))) for k, v in filters.items())), include_nat_volume, resolved.query.end)
        return self.cache.get_or_set(key, lambda: self._summary(period, resolved, group_by, filters, include_nat_volume))

    def _summary(
        self,
        period: str,
        resolved: periods.ResolvedPeriod,
        group_by: str,
        filters: dict[str, list[str]],
        include_nat_volume: bool,
    ) -> Summary:
        q = resolved.query
        result = Summary(
            period=period,
            window=_window_out(resolved.display),
            data_window=None if q.is_empty else _window_out(q),
            previous_window=None if q.is_empty else _window_out(resolved.previous),
            group_by=group_by,
            include_nat_volume=include_nat_volume,
            total_gb=0.0,
            egress_gb=0.0,
            ingress_gb=0.0,
            transit_gb=0.0,
            prev_total_gb=None,
            prev_egress_gb=None,
            prev_ingress_gb=None,
            prev_transit_gb=None,
            by_type={t: 0.0 for t in TRANSFER_TYPES},
            rows=[],
            series=[],
            volume_series=[],
            estimated=False,
            mock=self.mock,
        )
        if q.is_empty:
            return result

        usage_types = self._filtered_usage_types(q.start, q.end, filters)
        if not usage_types:
            return result

        ce_group = [{"Type": "DIMENSION", "Key": "USAGE_TYPE"}]
        if group_by in ("REGION", "LINKED_ACCOUNT", "SERVICE"):
            ce_group.append({"Type": "DIMENSION", "Key": group_by})
        elif group_by.startswith("TAG:"):
            ce_group.append({"Type": "TAG", "Key": group_by[4:]})
        elif group_by.startswith("COST_CATEGORY:"):
            ce_group.append({"Type": "COST_CATEGORY", "Key": group_by[14:]})

        results, attrs = self.ce.cost_and_usage(
            q.start, q.end, q.granularity, ["UsageQuantity"], self._filter_expr(usage_types, filters), ce_group
        )

        rows: dict[str, Row] = {}
        series: dict[str, dict[str, float]] = {}
        volume: dict[str, dict[str, float]] = {}
        for r in results:
            result.estimated |= bool(r.get("Estimated"))
            bucket = series.setdefault(r["TimePeriod"]["Start"], defaultdict(float))
            vbucket = volume.setdefault(r["TimePeriod"]["Start"], defaultdict(float))
            for g in r.get("Groups", []):
                ut = g["Keys"][0]
                kind = usage_types.get(ut)
                if kind is None:
                    continue
                gb = counted_gb(kind, float(g["Metrics"]["UsageQuantity"]["Amount"]), include_nat_volume)
                if not gb:
                    continue

                if group_by == "TRANSFER_TYPE":
                    gkey = kind
                elif group_by == "DIRECTION":
                    gkey = DIRECTION[kind]
                elif group_by == "USAGE_TYPE":
                    gkey = ut
                else:
                    gkey = _split_group_value(g["Keys"][1])

                row = rows.get(gkey)
                if row is None:
                    row = rows[gkey] = Row(key=gkey, label=self._label(group_by, gkey, attrs), gb=0, pct=0, by_type={})
                row.gb += gb
                row.by_type[kind] = row.by_type.get(kind, 0.0) + gb
                bucket[gkey] += gb
                vbucket[kind] += gb
                result.by_type[kind] += gb
                result.total_gb += gb

        result.egress_gb, result.ingress_gb, result.transit_gb = _by_direction(result.by_type)
        for row in rows.values():
            row.pct = row.gb / result.total_gb * 100 if result.total_gb else 0.0
        result.rows = sorted(rows.values(), key=lambda x: x.gb, reverse=True)
        result.series = [SeriesPoint(date=date.fromisoformat(d), values=dict(v)) for d, v in sorted(series.items())]
        result.volume_series = [SeriesPoint(date=date.fromisoformat(d), values=dict(v)) for d, v in sorted(volume.items())]

        prev = self._previous_by_type(resolved.previous, filters, include_nat_volume)
        result.prev_total_gb = sum(prev.values())
        result.prev_egress_gb, result.prev_ingress_gb, result.prev_transit_gb = _by_direction(prev)
        return result

    def _previous_by_type(
        self, w: periods.Window, filters: dict[str, list[str]], include_nat_volume: bool
    ) -> dict[str, float]:
        """Counted GB per transfer type for the window, in one MONTHLY call grouped by usage type."""
        usage_types = self._filtered_usage_types(w.start, w.end, filters)
        out: dict[str, float] = defaultdict(float)
        if not usage_types:
            return out
        results, _ = self.ce.cost_and_usage(
            w.start,
            w.end,
            "MONTHLY",
            ["UsageQuantity"],
            self._filter_expr(usage_types, filters),
            [{"Type": "DIMENSION", "Key": "USAGE_TYPE"}],
        )
        for r in results:
            for g in r.get("Groups", []):
                kind = usage_types.get(g["Keys"][0])
                if kind is not None:
                    out[kind] += counted_gb(kind, float(g["Metrics"]["UsageQuantity"]["Amount"]), include_nat_volume)
        return out

    def _filtered_usage_types(self, start: date, end: date, filters: dict[str, list[str]]) -> dict[str, str]:
        usage_types = self.dto_usage_types(start, end)
        if types := filters.get("TRANSFER_TYPE"):
            usage_types = {u: k for u, k in usage_types.items() if k in types}
        if directions := filters.get("DIRECTION"):
            usage_types = {u: k for u, k in usage_types.items() if DIRECTION[k] in directions}
        if uts := filters.get("USAGE_TYPE"):
            usage_types = {u: k for u, k in usage_types.items() if u in uts}
        return usage_types

    @staticmethod
    def _filter_expr(usage_types: dict[str, str], filters: dict[str, list[str]]) -> dict[str, Any]:
        parts: list[dict[str, Any]] = [
            {"Dimensions": {"Key": "USAGE_TYPE", "Values": sorted(usage_types)}},
            # Credits, refunds and discounts are booked on the same usage types with no volume; they would only add empty groups.
            {"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}},
        ]
        for dim, values in sorted(filters.items()):
            if dim in ("TRANSFER_TYPE", "DIRECTION", "USAGE_TYPE"):
                continue  # applied by narrowing the usage type list
            if dim.startswith("TAG:"):
                parts.append(_keyed_filter("Tags", dim[4:], values))
            elif dim.startswith("COST_CATEGORY:"):
                parts.append(_keyed_filter("CostCategories", dim[14:], values))
            else:
                parts.append({"Dimensions": {"Key": dim, "Values": values}})
        return _and(parts)

    def _label(self, group_by: str, key: str, attrs: dict[str, str]) -> str:
        if group_by == "REGION":
            return REGION_NAMES.get(key, key)
        if group_by == "LINKED_ACCOUNT":
            name = attrs.get(key) or self._account_names().get(key)
            return name if name and name != key else key
        if group_by.startswith(("TAG:", "COST_CATEGORY:")) and key == "":
            return UNTAGGED
        return key

    # ---- metadata --------------------------------------------------------

    def meta(self, default_tag_key: str | None = None, today: date | None = None) -> Meta:
        today = today or date.today()
        end = today + timedelta(days=1)
        start = (today - timedelta(days=90)).replace(day=1)

        def load() -> Meta:
            accounts = [
                Option(value=v["Value"], label=v.get("Attributes", {}).get("description") or v["Value"])
                for v in self.ce.dimension_values("LINKED_ACCOUNT", start, end)
            ]
            regions = [
                Option(value=v["Value"], label=REGION_NAMES.get(v["Value"], v["Value"]))
                for v in self.ce.dimension_values("REGION", start, end)
                if v["Value"]  # Cost Explorer reports some usage under an empty region
            ]
            services = sorted(v["Value"] for v in self.ce.dimension_values("SERVICE", start, end))
            try:
                tag_keys = self.ce.tag_keys(start, end)
            except Exception:
                tag_keys = []
            try:
                cost_categories = self.ce.cost_category_names(start, end)
            except Exception:
                cost_categories = []

            group_opts = [Option(value=k, label=v) for k, v in DIMENSIONS.items()]
            group_opts += [Option(value=f"TAG:{k}", label=f"Tag: {k}") for k in tag_keys]
            group_opts += [Option(value=f"COST_CATEGORY:{c}", label=f"Cost category: {c}") for c in cost_categories]
            return Meta(
                accounts=sorted(accounts, key=lambda o: o.label.lower()),
                regions=sorted(regions, key=lambda o: o.value),
                services=services,
                tag_keys=tag_keys,
                cost_categories=cost_categories,
                transfer_types=TRANSFER_TYPES,
                directions=DIRECTION,
                group_by_options=group_opts,
                default_tag_key=None,
                mock=self.mock,
            )

        meta = self.cache.get_or_set(("meta", start, end), load)
        tag = default_tag_key if default_tag_key in meta.tag_keys else None
        return meta.model_copy(update={"default_tag_key": tag})
