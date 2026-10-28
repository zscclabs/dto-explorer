# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-28

### Changed (breaking)
- The app reports data transfer **volume only**. Cost, the cost-metric choice, the discounts switch, effective rate and $/GB are gone. The API no longer accepts `metric` or `include_discounts` (old links still load; the parameters are ignored), and `Summary` / `Row` no longer have cost fields. `by_type` is now GB per transfer type.
- "Inter-Region" is renamed "Inter-Region Out".
- CSV export columns are `gb, pct, gb_<transfer type>…`.
- By default only internet traffic is counted. Inter-AZ, Inter-Region Out/In and To CloudFront are hidden behind an "Include traffic within AWS" switch (`include_aws_internal` API parameter, `aws_internal_types` in `/api/meta`).

### Added
- Inbound traffic: Internet In (`*DataTransfer-In-Bytes`), Inter-Region In (`*-AWS-In-Bytes`) and Other In.
- Direction (Out / In / Transit) as a filter and a breakdown (`DIRECTION`), with `egress_gb`, `ingress_gb`, `transit_gb` and their previous-period values.
- Egress, Ingress and Transit KPI tiles; the trend chart and share donut by breakdown now show GB.
- Inter-AZ, NAT Gateway and To CloudFront are labelled as transit in the volume charts (`directions` in `/api/meta`).
- "Include NAT volume" switch (`include_nat_volume` API parameter) to add NAT Gateway data processed back into transit.

### Fixed
- Data volume no longer double-counts NAT Gateway traffic: NAT data processed is left out of every total by default.

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
