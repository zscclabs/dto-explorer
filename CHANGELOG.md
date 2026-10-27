# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-26

### Added
- FastAPI backend that totals AWS Data Transfer Out from Cost Explorer for weekly, monthly or custom periods.
- Breakdown by region, linked account, service, transfer type (Internet / Inter-Region / Inter-AZ / NAT Gateway / To CloudFront / Other), usage type, cost allocation tag (e.g. VPC) and cost category.
- Comparison with the previous period of equal length, response caching and CSV export.
- React + MUI web UI with KPI cards, stacked trend chart, share donut, drill-down data grid, URL-shareable state and dark mode.
- Mock data mode (`DTO_MOCK=1`) for running without AWS.
- Docker image, CI and tag-driven release workflow.
