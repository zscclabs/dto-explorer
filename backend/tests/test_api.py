import pytest
from fastapi.testclient import TestClient

from app.cache import Cache
from app.ce_client import CostExplorer
from app.dto_service import DtoService
from app.main import app, get_service
from app.mock_ce import MockCostExplorerClient


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_service] = lambda: DtoService(CostExplorer(MockCostExplorerClient()), Cache(60), mock=True)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_summary_endpoint(client):
    r = client.get("/api/dto/summary", params={"period": "month", "start": "2026-09-01", "group_by": "LINKED_ACCOUNT", "filter": ["REGION=us-east-1"]})
    assert r.status_code == 200
    body = r.json()
    assert body["window"] == {"start": "2026-09-01", "end": "2026-09-30", "granularity": "DAILY"}
    assert body["rows"][0]["label"] == "prod"
    assert body["include_nat_volume"] is False

    r = client.get("/api/dto/summary", params={"period": "month", "start": "2026-09-01", "include_nat_volume": "true"})
    assert r.json()["include_nat_volume"] is True
    assert r.json()["by_type"]["NAT Gateway"]["gb"] > 0


def test_bad_params_return_400(client):
    assert client.get("/api/dto/summary", params={"group_by": "AZ"}).status_code == 400
    assert client.get("/api/dto/summary", params={"period": "custom", "start": "2026-02-01"}).status_code == 400
    assert client.get("/api/dto/summary", params={"filter": "REGION"}).status_code == 400


def test_csv_export(client):
    r = client.get("/api/dto/export.csv", params={"period": "custom", "start": "2026-09-01", "end": "2026-09-07", "group_by": "TRANSFER_TYPE"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("TRANSFER_TYPE,label,cost_usd,gb,pct")
    assert len(lines) > 1
