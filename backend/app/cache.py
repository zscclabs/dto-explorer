import threading
from collections.abc import Callable, Hashable
from typing import TypeVar

from cachetools import TTLCache

T = TypeVar("T")


class Cache:
    """Thread-safe TTL cache keyed on arbitrary hashable request parameters."""

    def __init__(self, ttl_seconds: int, maxsize: int = 512):
        self._data: TTLCache = TTLCache(maxsize=maxsize, ttl=max(ttl_seconds, 1))
        self._lock = threading.Lock()
        self.enabled = ttl_seconds > 0

    def get_or_set(self, key: Hashable, fn: Callable[[], T]) -> T:
        if not self.enabled:
            return fn()
        with self._lock:
            if key in self._data:
                return self._data[key]
        value = fn()
        with self._lock:
            self._data[key] = value
        return value

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
