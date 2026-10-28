import csv
import io
import tomllib
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .cache import Cache
from .ce_client import make_cost_explorer
from .config import Settings, get_settings
from .dto_service import DtoQueryError, DtoService, parse_filters
from .models import Meta, Summary

# pyproject.toml is the single source of the version (see scripts/bump-version.sh).
__version__ = tomllib.loads((Path(__file__).resolve().parents[1] / "pyproject.toml").read_text())["project"]["version"]

app = FastAPI(title="AWS DTO Explorer", version=__version__)


@lru_cache
def get_service() -> DtoService:
    settings = get_settings()
    return DtoService(make_cost_explorer(settings), Cache(settings.cache_ttl_seconds), mock=settings.mock)


@app.exception_handler(DtoQueryError)
async def _bad_query(_: Request, exc: DtoQueryError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(ClientError)
async def _aws_client_error(_: Request, exc: ClientError) -> JSONResponse:
    err = exc.response.get("Error", {})
    return JSONResponse(status_code=502, content={"detail": f"AWS {err.get('Code', 'error')}: {err.get('Message', str(exc))}"})


@app.exception_handler(BotoCoreError)
async def _aws_error(_: Request, exc: BotoCoreError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": f"AWS: {exc}"})


class SummaryParams:
    def __init__(
        self,
        period: Literal["week", "month", "custom"] = "month",
        start: date | None = None,
        end: date | None = None,
        group_by: str = "REGION",
        include_nat_volume: bool = False,
        include_aws_internal: bool = False,
        filters: Annotated[list[str], Query(alias="filter", description="Repeatable DIM=value, e.g. REGION=us-east-1")] = [],
    ):
        self.period = period
        self.start = start
        self.end = end
        self.group_by = group_by
        self.include_nat_volume = include_nat_volume
        self.include_aws_internal = include_aws_internal
        self.filters = filters

    def run(self, service: DtoService) -> Summary:
        return service.summary(
            self.period,
            self.start,
            self.end,
            self.group_by,
            parse_filters(self.filters),
            self.include_nat_volume,
            self.include_aws_internal,
        )


@app.get("/api/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    return {"status": "ok", "version": __version__, "mock": settings.mock}


@app.get("/api/meta", response_model=Meta)
def meta(service: DtoService = Depends(get_service), settings: Settings = Depends(get_settings)) -> Meta:
    return service.meta(default_tag_key=settings.default_tag_key)


@app.get("/api/dto/summary", response_model=Summary)
def summary(params: SummaryParams = Depends(), service: DtoService = Depends(get_service)) -> Summary:
    return params.run(service)


@app.get("/api/dto/export.csv")
def export_csv(params: SummaryParams = Depends(), service: DtoService = Depends(get_service)) -> StreamingResponse:
    s = params.run(service)
    buf = io.StringIO()
    writer = csv.writer(buf)
    types = list(s.by_type)
    writer.writerow([s.group_by, "label", "gb", "pct", *[f"gb_{t}" for t in types]])
    for r in s.rows:
        writer.writerow([r.key, r.label, f"{r.gb:.4f}", f"{r.pct:.2f}", *[f"{r.by_type.get(t, 0):.4f}" for t in types]])
    name = f"dto_{s.window.start}_{s.window.end}_{s.group_by.replace(':', '-')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@app.post("/api/cache/clear")
def clear_cache(service: DtoService = Depends(get_service)) -> dict:
    service.cache.clear()
    return {"status": "cleared"}


# Serve the built SPA when present (production); in dev Vite serves it and proxies /api.
_dist = get_settings().frontend_dist
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = (_dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(_dist.resolve()):
            return FileResponse(file)
        return FileResponse(_dist / "index.html")
