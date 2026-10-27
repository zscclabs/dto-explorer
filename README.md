# DTO Explorer

A web app that totals **AWS Data Transfer Out (DTO)** cost and volume for a week, a month or a custom date range, and breaks it down by region, account, transfer type, service, usage type, cost allocation tag (for example a VPC tag) or cost category.

- **Backend:** Python, FastAPI and boto3, with AWS Cost Explorer as the data source
- **Frontend:** React 19, Vite, MUI v7 and MUI X (Charts, DataGrid, Date Pickers), with light and dark mode
- **License:** MIT (see [LICENSE](LICENSE))
- **Packaging:** one Docker image (FastAPI serves both the API and the built UI), published to GHCR when a release is tagged

![DTO Explorer dashboard: KPIs, cost and data volume over time, share by region and by transfer type](docs/dto-explore.png)

## Contents
- [Features](#features)
- [Requirements](#requirements)
- [Using it](#using-it)
- [AWS setup](#aws-setup)
- [Configuration](#configuration)
- [Development](#development)
- [Releasing](#releasing)
- [How DTO is identified](#how-dto-is-identified)
- [API](#api)

## Features
- **Periods:** weekly (Monday–Sunday) or monthly with previous/next navigation, or a custom range with presets (last 7/30/90 days, year to date, last 12 months)
- **Headline numbers:** total cost, total volume, cost per GB and top contributor. Cost and volume show the change against the previous period of the same length.
- **Charts and table:** stacked daily or monthly cost chart, share donut, and a sortable, searchable table with click-to-drill-down
- **Filters:** account, region and transfer type, plus drill-down filters on any dimension
- **Other:** CSV export, shareable URLs, a choice of cost metric (unblended, amortized, net and so on), a [discounts and credits](#discounts-and-credits) switch, and a mock-data mode that needs no AWS account

## Requirements

| To… | You need |
|---|---|
| Run with Docker | Docker, plus AWS credentials in `~/.aws` |
| Run from source | Python ≥ 3.11 with [uv](https://docs.astral.sh/uv/), Node ≥ 20 with npm, and `make` |
| Read real data | Cost Explorer enabled in the AWS account, and the [IAM permissions](#iam-permissions) below |

## Using it

### Option A: Docker image (recommended)

```bash
aws sso login --profile my-profile          # or any other way of getting credentials

docker run --rm -p 8000:8000 \
  -v ~/.aws:/home/app/.aws \
  -e AWS_PROFILE=my-profile \
  ghcr.io/<owner>/<repo>:latest
```
Then open http://localhost:8000.

- The `~/.aws` mount gives the container your config and SSO token cache. It's mounted read-write so that boto3 can refresh SSO tokens.
- Static credentials work too: pass `-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN` instead of the mount.
- To try it without AWS: `docker run --rm -p 8000:8000 -e DTO_MOCK=1 ghcr.io/<owner>/<repo>:latest`
- To build the image locally: `make docker && make docker-run AWS_PROFILE=my-profile`

### Option B: From source

```bash
git clone https://github.com/<owner>/<repo>.git && cd <repo>
make install                             # uv sync + npm install

make dev-mock                            # synthetic data → http://localhost:5173
AWS_PROFILE=my-profile make dev          # real data      → http://localhost:5173
AWS_PROFILE=my-profile make serve        # production build, one process → http://localhost:8000
```

`make dev` runs uvicorn with auto-reload on `:8000` and Vite on `:5173`. Vite forwards `/api` requests to uvicorn.

### Single account vs. AWS Organization
- **Single account:** use that account's credentials. The account filter will show just that one account.
- **Organization:** use credentials for the **management (payer) account** to see every linked account. Breaking down by account then shows each account by name.

### When your SSO session expires
The UI shows an AWS error. Run `aws sso login --profile my-profile` again. You don't need to restart, but if errors persist, restart the app.

## AWS setup

### IAM permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ce:GetCostAndUsage", "ce:GetDimensionValues", "ce:GetTags", "ce:GetCostCategories"],
    "Resource": "*"
  }]
}
```

### Cost
Each Cost Explorer request costs **$0.01**. One dashboard view makes about 12 requests on a cold cache. Responses are cached in memory for 1 hour (`DTO_CACHE_TTL_SECONDS`). The ↻ button in the UI clears the cache and fetches fresh data.

### Discounts and credits
By default the app shows **usage charges at list price** (Cost Explorer `RECORD_TYPE = Usage`). AWS books credits, refunds and EDP / private-rate discounts as separate negative charges, often under no region, so including them would produce negative groups and shares above 100%. Turn on **Include discounts & credits** to see net cost instead. Volume (GB) is the same either way.

### Per-VPC breakdown
Cost Explorer has **no VPC dimension**. To get a per-VPC breakdown:
1. Tag resources that generate transfer charges (NAT gateways, load balancers, EC2 instances, etc.) with something like `vpc=<name>`. An existing `Name` tag works if your resources are named after their VPC.
2. Activate that tag as a **cost allocation tag** in Billing → Cost allocation tags. In an Organization, only the management account can do this. Data appears from the activation date onward.
3. Choose **Tag: vpc** under "Break down by", or set `DTO_DEFAULT_TAG_KEY=vpc` to make it the default.

## Configuration

Set these as environment variables or in `backend/.env`, which git ignores.

| Variable | Default | Purpose |
|---|---|---|
| `AWS_PROFILE` | – | Standard boto3 profile selection |
| `DTO_AWS_PROFILE` | – | Profile used by the app, overriding `AWS_PROFILE` |
| `DTO_MOCK` | `false` | Serve synthetic data instead of calling AWS |
| `DTO_CACHE_TTL_SECONDS` | `3600` | Cache lifetime; `0` disables caching |
| `DTO_DEFAULT_TAG_KEY` | – | Tag key to group by initially (e.g. `vpc`) |
| `DTO_CE_REGION` | `us-east-1` | Cost Explorer endpoint region |

## Development

```
backend/
  app/
    main.py          FastAPI routes; serves frontend/dist when it exists
    dto_service.py   finds DTO usage types, classifies them, builds Cost Explorer queries, aggregates
    ce_client.py     boto3 Cost Explorer wrapper (pagination)
    periods.py       week / month / custom → date windows
    mock_ce.py       synthetic Cost Explorer client for DTO_MOCK=1
  tests/             pytest (botocore Stubber + mock client)
frontend/src/
  App.tsx            page layout, URL-synced state, drill-down
  components/        PeriodSelector, FilterBar, KpiCards, charts, BreakdownTable
scripts/             version bump / check helpers
.github/workflows/   ci.yml, release.yml
```

```bash
make test        # backend pytest + frontend type-check
make build       # production UI bundle → frontend/dist
```

CI (`.github/workflows/ci.yml`) runs the backend tests, the frontend type-check and build, and a Docker build on every push to `main` and on every pull request.

## Releasing

Releases are driven by git tags. The version lives in `backend/pyproject.toml` and `frontend/package.json`, which must match the tag.

1. **Bump the version** (this also refreshes `uv.lock` and `package-lock.json`):
   ```bash
   make bump VERSION=0.2.0
   ```
2. **Update `CHANGELOG.md`:** move the items under `[Unreleased]` into a new `## [0.2.0] - YYYY-MM-DD` section.
3. **Commit, tag and push:**
   ```bash
   git commit -am "Release v0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```
4. **GitHub Actions** (`.github/workflows/release.yml`) then:
   - checks that the tag matches both version files
   - runs the full CI
   - builds a multi-architecture image (`linux/amd64` and `linux/arm64`) and pushes it to `ghcr.io/<owner>/<repo>` tagged `0.2.0`, `0.2` and `latest`
   - creates a GitHub Release whose notes come from the CHANGELOG section plus auto-generated notes

Tags with a suffix, such as `v0.3.0-rc.1`, are published as pre-releases and don't move `latest`.

**First release only:** after the image is pushed, open the package's settings on GitHub (your profile or org → Packages) and set its visibility. If the repository is private, the package is private too.

## How DTO is identified

Usage types are discovered with `GetDimensionValues` and then classified:

| Transfer type | Usage type pattern |
|---|---|
| Internet Out | `*DataTransfer-Out-Bytes` (includes CloudFront edge egress) |
| Inter-Region | `<SRC>-<DST>-AWS-Out-Bytes` |
| Inter-AZ | `*DataTransfer-Regional-Bytes` |
| NAT Gateway | `*NatGateway-Bytes` (data processing) |
| To CloudFront | `*CloudFront-Out-Bytes` |
| Other Out | anything else ending in `Out-Bytes`, `Out-OBytes` or `Out-ABytes` |

Inbound usage types (`*-In-*`) are excluded. You can narrow the result to particular transfer types with the filter.

## API

Interactive docs are at `/docs` while the app is running.

- `GET /api/health`: status and version
- `GET /api/meta`: accounts, regions, tag keys, cost categories and breakdown options
- `GET /api/dto/summary?period=week|month|custom&start=YYYY-MM-DD&end=YYYY-MM-DD&group_by=REGION&metric=UnblendedCost&include_discounts=false&filter=REGION=us-east-1&filter=TAG:vpc=prod`
  - `week` and `month` take the period containing `start` (today by default). `custom` uses `start` to `end`, both inclusive.
  - `group_by`: `REGION`, `LINKED_ACCOUNT`, `SERVICE`, `TRANSFER_TYPE`, `USAGE_TYPE`, `TAG:<key>` or `COST_CATEGORY:<name>`
  - `include_discounts`: `false` (default) for list-price usage, `true` for net of credits and discounts
  - `filter` can be repeated. Values for the same dimension are OR'd and different dimensions are AND'd. An empty tag value (`TAG:vpc=`) means untagged.
- `GET /api/dto/export.csv`: same parameters, returns a CSV file
- `POST /api/cache/clear`
