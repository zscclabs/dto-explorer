"""In-memory stand-in for the boto3 Cost Explorer client (enabled with DTO_MOCK=1).

It builds a fixed set of synthetic line items and answers get_cost_and_usage by
filtering / grouping them, so the full service and UI path is exercised.
"""

import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

ACCOUNTS = {
    "111111111111": "prod",
    "222222222222": "staging",
    "333333333333": "data-platform",
    "444444444444": "shared-services",
}
BUSINESS_UNIT = {"111111111111": "Core", "222222222222": "Core", "333333333333": "Analytics", "444444444444": "Platform"}
REGIONS = {"us-east-1": "USE1", "us-west-2": "USW2", "eu-west-1": "EU", "eu-central-1": "EUC1", "ap-southeast-1": "APS1"}
PEER = {"us-east-1": "us-west-2", "us-west-2": "us-east-1", "eu-west-1": "eu-central-1", "eu-central-1": "eu-west-1", "ap-southeast-1": "us-east-1"}
VPCS = {"us-east-1": "vpc-core-use1", "us-west-2": "vpc-dr-usw2", "eu-west-1": "vpc-edge-euw1", "eu-central-1": "vpc-core-euc1", "ap-southeast-1": "vpc-edge-apse1"}
TEAMS = ["payments", "search", "ml", ""]
PRICE = {"internet": 0.09, "interregion": 0.02, "interaz": 0.01, "nat": 0.045, "in": 0.0}


@dataclass
class Line:
    usage_type: str
    region: str
    account: str
    service: str
    base_gb: float
    price: float
    seed: int
    tags: dict[str, str] = field(default_factory=dict)
    record_type: str = "Usage"

    def gb_on(self, d: date) -> float:
        rng = random.Random(self.seed * 100_003 + d.toordinal())
        weekly = 1.0 - 0.25 * (d.weekday() >= 5)
        trend = 1.0 + 0.0015 * (d.toordinal() - date(2025, 1, 1).toordinal())
        return max(self.base_gb * weekly * trend * (0.8 + 0.4 * rng.random()) * (1 + 0.1 * math.sin(d.toordinal() / 9)), 0)

    def attr(self, dim: str) -> str:
        return {
            "USAGE_TYPE": self.usage_type,
            "REGION": self.region,
            "LINKED_ACCOUNT": self.account,
            "SERVICE": self.service,
            "RECORD_TYPE": self.record_type,
        }.get(dim, "")


def _build_lines() -> list[Line]:
    rng = random.Random(42)
    lines: list[Line] = []
    for account in ACCOUNTS:
        for region, prefix in REGIONS.items():
            if account == "222222222222" and region not in ("us-east-1", "eu-west-1"):
                continue
            scale = 3.0 if account == "111111111111" else 1.0
            kinds = [
                (f"{prefix}-DataTransfer-Out-Bytes", "internet", "EC2 - Other", 400),
                (f"{prefix}-DataTransfer-Out-Bytes", "internet", "Amazon Simple Storage Service", 250),
                (f"{prefix}-DataTransfer-Regional-Bytes", "interaz", "EC2 - Other", 900),
                (f"{prefix}-DataTransfer-Regional-Bytes", "interaz", "Amazon Relational Database Service", 200),
                (f"{prefix}-NatGateway-Bytes", "nat", "EC2 - Other", 350),
                (f"{prefix}-{REGIONS[PEER[region]]}-AWS-Out-Bytes", "interregion", "AWS Data Transfer", 300),
                (f"{prefix}-CloudFront-Out-Bytes", "in", "EC2 - Other", 120),
                (f"{prefix}-DataTransfer-In-Bytes", "in", "EC2 - Other", 500),
            ]
            for ut, kind, service, base in kinds:
                tags = {"vpc": VPCS[region] if rng.random() > 0.15 else "", "team": rng.choice(TEAMS)}
                lines.append(
                    Line(ut, region, account, service, base * scale * (0.3 + rng.random()), PRICE[kind], len(lines), tags)
                )
    # CloudFront edge egress (global, 2-letter prefixes).
    for prefix, base in (("US", 2500), ("EU", 1200), ("AP", 600)):
        lines.append(
            Line(f"{prefix}-DataTransfer-Out-Bytes", "global", "111111111111", "Amazon CloudFront", base, 0.085, len(lines), {"vpc": "", "team": "search"})
        )
    # Negotiated discounts are booked as negative line items, often without the original region.
    for prefix in ("USE1", "EU"):
        lines.append(
            Line(f"{prefix}-DataTransfer-Out-Bytes", "NoRegion", "111111111111", "EC2 - Other", 1500, -0.015, len(lines), {"vpc": "", "team": ""}, "Private Rate Card Discount")
        )
    return lines


def _matches(line: Line, expr: dict[str, Any] | None) -> bool:
    if not expr:
        return True
    if "And" in expr:
        return all(_matches(line, e) for e in expr["And"])
    if "Or" in expr:
        return any(_matches(line, e) for e in expr["Or"])
    if "Not" in expr:
        return not _matches(line, expr["Not"])
    if "Dimensions" in expr:
        d = expr["Dimensions"]
        return line.attr(d["Key"]) in d.get("Values", [])
    if "Tags" in expr:
        t = expr["Tags"]
        value = line.tags.get(t["Key"], "")
        if "ABSENT" in t.get("MatchOptions", []):
            return value == ""
        return value in t.get("Values", [])
    if "CostCategories" in expr:
        c = expr["CostCategories"]
        value = BUSINESS_UNIT.get(line.account, "") if c["Key"] == "Business Unit" else ""
        if "ABSENT" in c.get("MatchOptions", []):
            return value == ""
        return value in c.get("Values", [])
    return True


def _group_key(line: Line, g: dict[str, str]) -> str:
    if g["Type"] == "TAG":
        return f"{g['Key']}${line.tags.get(g['Key'], '')}"
    if g["Type"] == "COST_CATEGORY":
        value = BUSINESS_UNIT.get(line.account, "") if g["Key"] == "Business Unit" else ""
        return f"{g['Key']}${value}"
    return line.attr(g["Key"])


def _buckets(start: date, end: date, granularity: str) -> list[tuple[date, date]]:
    out = []
    cur = start
    while cur < end:
        if granularity == "DAILY":
            nxt = cur + timedelta(days=1)
        else:
            nxt = date(cur.year + cur.month // 12, cur.month % 12 + 1, 1)
        out.append((cur, min(nxt, end)))
        cur = nxt
    return out


def _metrics(names: list[str], cost: float, gb: float) -> dict[str, dict[str, str]]:
    return {n: ({"Amount": f"{gb:.6f}", "Unit": "GB"} if n == "UsageQuantity" else {"Amount": f"{cost:.6f}", "Unit": "USD"}) for n in names}


class MockCostExplorerClient:
    def __init__(self) -> None:
        self.lines = _build_lines()

    def get_dimension_values(self, TimePeriod: dict, Dimension: str, SearchString: str | None = None, **_: Any) -> dict:
        values = sorted({line.attr(Dimension) for line in self.lines} - {""})
        if SearchString:
            values = [v for v in values if SearchString.lower() in v.lower()]
        out = []
        for v in values:
            attrs = {"description": ACCOUNTS[v]} if Dimension == "LINKED_ACCOUNT" else {}
            out.append({"Value": v, "Attributes": attrs})
        return {"DimensionValues": out, "ReturnSize": len(out), "TotalSize": len(out)}

    def get_tags(self, TimePeriod: dict, **_: Any) -> dict:
        return {"Tags": ["team", "vpc"], "ReturnSize": 2, "TotalSize": 2}

    def get_cost_categories(self, TimePeriod: dict, **_: Any) -> dict:
        return {"CostCategoryNames": ["Business Unit"], "ReturnSize": 1, "TotalSize": 1}

    def get_cost_and_usage(
        self,
        TimePeriod: dict,
        Granularity: str,
        Metrics: list[str],
        Filter: dict | None = None,
        GroupBy: list[dict] | None = None,
        **_: Any,
    ) -> dict:
        start, end = date.fromisoformat(TimePeriod["Start"]), date.fromisoformat(TimePeriod["End"])
        if end <= start:
            raise ValueError("Start must be before End")
        today = date.today()
        lines = [line for line in self.lines if _matches(line, Filter)]
        results = []
        for b_start, b_end in _buckets(start, end, Granularity):
            groups: dict[tuple[str, ...], list[float]] = {}
            total = [0.0, 0.0]
            d = b_start
            while d < min(b_end, today + timedelta(days=1)):
                for line in lines:
                    gb = line.gb_on(d)
                    cost = gb * line.price
                    if line.record_type != "Usage":
                        gb = 0.0  # discounts carry cost but no usage quantity
                    total[0] += cost
                    total[1] += gb
                    if GroupBy:
                        acc = groups.setdefault(tuple(_group_key(line, g) for g in GroupBy), [0.0, 0.0])
                        acc[0] += cost
                        acc[1] += gb
                d += timedelta(days=1)
            results.append(
                {
                    "TimePeriod": {"Start": b_start.isoformat(), "End": b_end.isoformat()},
                    "Total": {} if GroupBy else _metrics(Metrics, *total),
                    "Groups": [{"Keys": list(k), "Metrics": _metrics(Metrics, c, g)} for k, (c, g) in sorted(groups.items())],
                    "Estimated": b_end >= today,
                }
            )
        attrs = []
        if GroupBy and any(g["Key"] == "LINKED_ACCOUNT" for g in GroupBy):
            attrs = [{"Value": k, "Attributes": {"description": v}} for k, v in ACCOUNTS.items()]
        return {"ResultsByTime": results, "DimensionValueAttributes": attrs, "GroupDefinitions": GroupBy or []}
