# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- "Include NAT volume" switch (`include_nat_volume` API parameter) to add NAT Gateway data processed back into volume figures.
- Egress volume (`egress_gb`, `prev_egress_gb`): Internet Out, Inter-Region and Other Out only, shown under "Data transferred".
- Inter-AZ, NAT Gateway and To CloudFront are labelled as transit in the volume charts (`transit_types` in `/api/meta`).

### Fixed
- Data volume no longer double-counts NAT Gateway traffic: NAT data processing bytes are excluded from volume by default (their cost is still counted), and the effective rate leaves NAT cost out when its volume is excluded.

## [0.2.0] - 2026-10-26

### Added
- Data volume (GB) over time chart, stacked by transfer type.
- Data volume share by transfer type donut, next to the volume chart.
- "Include discounts & credits" switch (`include_discounts` API parameter) to show net cost.

### Fixed
- Credits, refunds and EDP / private-rate discounts are booked by AWS as negative charges, often under no region. They are now excluded by default, so breakdowns no longer show negative groups or shares above 100%.

## [0.1.0] - 2026-10-26

### Added
- FastAPI backend that totals AWS Data Transfer Out from Cost Explorer for weekly, monthly or custom periods.
- Breakdown by region, linked account, service, transfer type (Internet / Inter-Region / Inter-AZ / NAT Gateway / To CloudFront / Other), usage type, cost allocation tag (e.g. VPC) and cost category.
- Comparison with the previous period of equal length, response caching and CSV export.
- React + MUI web UI with KPI cards, stacked trend chart, share donut, drill-down data grid, URL-shareable state and dark mode.
- Mock data mode (`DTO_MOCK=1`) for running without AWS.
- Docker image, CI and tag-driven release workflow.
