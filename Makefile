.PHONY: install dev dev-mock api ui build serve serve-mock test docker docker-run bump

install:
	cd backend && uv sync
	cd frontend && npm install

# Backend on :8000 and Vite (with /api proxy) on :5173, using real AWS credentials.
dev:
	$(MAKE) -j2 api ui

# Same, with synthetic data — no AWS account needed.
dev-mock:
	DTO_MOCK=1 DTO_DEFAULT_TAG_KEY=vpc $(MAKE) -j2 api ui

api:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

ui:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

# Single process: FastAPI serves the built UI on :8000.
serve: build
	cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

serve-mock: build
	cd backend && DTO_MOCK=1 DTO_DEFAULT_TAG_KEY=vpc uv run uvicorn app.main:app --port 8000

test:
	cd backend && uv run pytest -q
	cd frontend && npx tsc -b

IMAGE ?= dto-explorer
AWS_PROFILE ?= default

docker:
	docker build -t $(IMAGE) .

# Uses your local AWS config (incl. SSO cache); run `aws sso login --profile $(AWS_PROFILE)` first.
docker-run:
	docker run --rm -p 8000:8000 -v $(HOME)/.aws:/home/app/.aws -e AWS_PROFILE=$(AWS_PROFILE) $(IMAGE)

# make bump VERSION=0.2.0
bump:
	scripts/bump-version.sh $(VERSION)
