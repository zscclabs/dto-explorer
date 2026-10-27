"""Turn a period selection (week / month / custom) into Cost Explorer time windows."""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

PeriodKind = Literal["week", "month", "custom"]

# Above this many days, daily granularity produces unreadable charts and slow queries.
MAX_DAILY_DAYS = 92


@dataclass(frozen=True)
class Window:
    start: date  # inclusive
    end: date  # exclusive (Cost Explorer semantics)
    granularity: Literal["DAILY", "MONTHLY"]

    @property
    def days(self) -> int:
        return (self.end - self.start).days

    @property
    def is_empty(self) -> bool:
        return self.end <= self.start

    @property
    def last_day(self) -> date:
        """Inclusive end date, for display."""
        return self.end - timedelta(days=1)


@dataclass(frozen=True)
class ResolvedPeriod:
    display: Window  # the full period the user selected
    query: Window  # display window clipped to data that can exist (up to today)
    previous: Window  # same number of days immediately before, for comparison


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    return date(d.year + m // 12, m % 12 + 1, 1)


def _granularity(days: int) -> Literal["DAILY", "MONTHLY"]:
    return "DAILY" if days <= MAX_DAILY_DAYS else "MONTHLY"


def resolve(
    kind: PeriodKind,
    start: date | None = None,
    end: date | None = None,
    today: date | None = None,
) -> ResolvedPeriod:
    """Resolve a period.

    - week: ISO week (Mon-Sun) containing `start` (default: today)
    - month: calendar month containing `start` (default: today)
    - custom: `start`..`end`, both inclusive
    """
    today = today or date.today()

    if kind == "week":
        anchor = start or today
        p_start = anchor - timedelta(days=anchor.weekday())
        p_end = p_start + timedelta(days=7)
        prev_start = p_start - timedelta(days=7)
    elif kind == "month":
        anchor = start or today
        p_start = anchor.replace(day=1)
        p_end = _add_months(p_start, 1)
        prev_start = _add_months(p_start, -1)
    else:
        if start is None or end is None:
            raise ValueError("custom period requires both start and end")
        if end < start:
            raise ValueError("end must be on or after start")
        p_start, p_end = start, end + timedelta(days=1)
        prev_start = p_start - (p_end - p_start)

    gran = _granularity((p_end - p_start).days)
    display = Window(p_start, p_end, gran)

    # Cost Explorer has no data for the future; clip so partial periods compare fairly.
    q_end = min(p_end, today + timedelta(days=1))
    query = Window(p_start, max(q_end, p_start), gran)

    prev_end = prev_start + timedelta(days=query.days)
    previous = Window(prev_start, prev_end, _granularity(query.days))
    return ResolvedPeriod(display=display, query=query, previous=previous)
