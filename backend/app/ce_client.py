"""Thin wrapper over the boto3 Cost Explorer client that handles pagination."""

from datetime import date
from typing import Any

import boto3
from botocore.config import Config

from .config import Settings


def _period(start: date, end: date) -> dict[str, str]:
    return {"Start": start.isoformat(), "End": end.isoformat()}


class CostExplorer:
    def __init__(self, client: Any):
        self._client = client

    def dimension_values(
        self, dimension: str, start: date, end: date, search: str | None = None
    ) -> list[dict[str, Any]]:
        kwargs: dict[str, Any] = {
            "TimePeriod": _period(start, end),
            "Dimension": dimension,
            "Context": "COST_AND_USAGE",
        }
        if search:
            kwargs["SearchString"] = search
        values: list[dict[str, Any]] = []
        while True:
            resp = self._client.get_dimension_values(**kwargs)
            values.extend(resp.get("DimensionValues", []))
            token = resp.get("NextPageToken")
            if not token:
                return values
            kwargs["NextPageToken"] = token

    def cost_and_usage(
        self,
        start: date,
        end: date,
        granularity: str,
        metrics: list[str],
        filter_expr: dict[str, Any] | None = None,
        group_by: list[dict[str, str]] | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, str]]:
        """Return (ResultsByTime merged across pages, {dimension value: description})."""
        kwargs: dict[str, Any] = {
            "TimePeriod": _period(start, end),
            "Granularity": granularity,
            "Metrics": metrics,
        }
        if filter_expr:
            kwargs["Filter"] = filter_expr
        if group_by:
            kwargs["GroupBy"] = group_by

        # Pages split groups of the same time bucket, so merge by period start.
        by_start: dict[str, dict[str, Any]] = {}
        attrs: dict[str, str] = {}
        while True:
            resp = self._client.get_cost_and_usage(**kwargs)
            for r in resp.get("ResultsByTime", []):
                key = r["TimePeriod"]["Start"]
                if key in by_start:
                    by_start[key].setdefault("Groups", []).extend(r.get("Groups", []))
                else:
                    by_start[key] = {**r, "Groups": list(r.get("Groups", []))}
            for a in resp.get("DimensionValueAttributes", []):
                desc = a.get("Attributes", {}).get("description")
                if desc:
                    attrs[a["Value"]] = desc
            token = resp.get("NextPageToken")
            if not token:
                break
            kwargs["NextPageToken"] = token
        return [by_start[k] for k in sorted(by_start)], attrs

    def tag_keys(self, start: date, end: date) -> list[str]:
        kwargs: dict[str, Any] = {"TimePeriod": _period(start, end)}
        keys: list[str] = []
        while True:
            resp = self._client.get_tags(**kwargs)
            keys.extend(resp.get("Tags", []))
            token = resp.get("NextPageToken")
            if not token:
                return sorted(set(keys))
            kwargs["NextPageToken"] = token

    def cost_category_names(self, start: date, end: date) -> list[str]:
        kwargs: dict[str, Any] = {"TimePeriod": _period(start, end)}
        names: list[str] = []
        while True:
            resp = self._client.get_cost_categories(**kwargs)
            names.extend(resp.get("CostCategoryNames", []))
            token = resp.get("NextPageToken")
            if not token:
                return sorted(set(names))
            kwargs["NextPageToken"] = token


def make_cost_explorer(settings: Settings) -> CostExplorer:
    if settings.mock:
        from .mock_ce import MockCostExplorerClient

        return CostExplorer(MockCostExplorerClient())

    session = boto3.Session(profile_name=settings.aws_profile) if settings.aws_profile else boto3.Session()
    client = session.client(
        "ce",
        region_name=settings.ce_region,
        config=Config(retries={"mode": "adaptive", "max_attempts": 10}),
    )
    return CostExplorer(client)
