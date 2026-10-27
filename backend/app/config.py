from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DTO_", env_file=".env", extra="ignore")

    # Serve synthetic data instead of calling AWS (useful for UI work / demos).
    mock: bool = False
    # Optional named profile; otherwise the standard boto3 credential chain is used.
    aws_profile: str | None = None
    # Cost Explorer is a global service served from us-east-1.
    ce_region: str = "us-east-1"
    # Every Cost Explorer request costs $0.01, so responses are cached.
    cache_ttl_seconds: int = 3600
    # Tag key pre-selected in the UI for VPC-style grouping (e.g. "vpc" or "Name").
    default_tag_key: str | None = None
    frontend_dist: Path = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()
