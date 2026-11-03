# SpaceBook

A full-stack creative-space booking app and Playwright/TypeScript QA automation portfolio. Customers can browse spaces, sign up or sign in, book available time slots, view their bookings, and cancel reservations. The app uses React, Express, and SQLite.

## Run the app locally

**Requirements:** Node.js 22.13+ and npm. No external database or services are needed.

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/spaces** (or `http://localhost:5173/spaces`).

The command starts the Vite frontend on port **5173** and Express API on port **3001**, prepares the development database (`data/dev.sqlite`), and seeds example spaces. It does **not** erase existing development bookings. Stop both processes with Ctrl+C.

Configuration is optional for local development; copy `.env.example` to `.env` if you need to override `APP_ENV`, `DB_PATH`, `PORT`, or `APP_ORIGIN`.

## Run the tests

**The app does not need to be running first.** Playwright starts its own frontend and backend, resets the isolated `data/e2e.sqlite` database, and cleans up per-test data. Stop any manually running server on ports 5173/3001 before launching Playwright.

```bash
npx playwright install chromium               # one-time setup for browser tests
npx playwright test                             # all 20 tests: API + UI + recovery + E2E
npx playwright test --project=api               # six API tests
npx playwright test --project=chromium          # 14 browser tests
npx playwright test --project=api --grep @pr    # six PR API checks
npx playwright test --grep @hourly              # five illustrative smoke tests
npx playwright test --grep @security            # four security-focused tests
npx playwright test --grep @recovery            # three recovery tests
```

Useful additional checks:

```bash
npm run typecheck
npm run lint
npm run test:backend                            # six Node/SQLite backend tests
npm run build
npx playwright test --list                      # list selected tests without running
npx playwright show-report automation/playwright-report
```

Playwright records an HTML report in `automation/playwright-report/`; failure traces and screenshots are retained when tests fail. The UI suite uses Chromium and the `Europe/Warsaw` timezone.

## Test coverage and structure

**20 Playwright tests:** 9 UI scenarios, 6 API scenarios, 4 controlled-failure/account-isolation scenarios, and 1 complete signup → booking → cancellation E2E journey that checks UI, API, and SQLite. Six additional backend tests live in `server/tests/`.

```text
automation/
  tests/
    ui/       Browser functionality (UI-01–UI-09)
    api/      Booking API behavior (API-01–API-06)
    mocked/   Recovery, concurrency and account isolation (MOCK-01–MOCK-04)
    e2e/      Signup → booking → cancellation (E2E-01)
  fixtures/   Test-scoped accounts, scenarios, and cleanup
  flows/      Business actions, assertions, and Playwright test.step()
  pages/      Page objects and UI locators
  api/        Typed API clients
  data/       Test-data factories
  support/    TestDataManager and read-only SQLite verification
```

Specs remain business-readable: they call flow methods; flows hold assertions, page objects hold UI interactions, and API clients hold HTTP details. Fixtures create isolated data, and `TestDataManager` performs cleanup. See **[AGENTS.md](AGENTS.md)** for architecture and coding-agent conventions.

## Application structure

```text
src/          React UI, authentication screens, booking flows, HTTP utilities
server/       Express API, session authentication, SQLite access and backend tests
shared/       API contracts, schemas, currency and timezone constants
migrations/   SQLite schema migrations
public/       Bundled app images
docs/         Feature requirements
```

Booking times use **Europe/Warsaw**; prices are **EUR integer cents**. Sessions are server-managed using HttpOnly cookies; account bookings require ownership checks and an idempotency key for safe retries. See [Authentication and My Bookings requirements](docs/authentication-my-bookings-requirements.md) for further application behavior.

## CI: SpaceBook PR Tests

The repository has **one** GitHub Actions workflow: [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml). It runs on **pull requests to `main`** and via **manual dispatch**. The workflow runs typecheck, lint, backend tests, build, and the six API tests tagged `@pr`; it uploads the Playwright HTML report. No hourly or nightly workflows are scheduled—`@hourly`, `@security`, and `@recovery` are demonstration tags for manual filtering.

**Test safety:** Playwright's startup resets `data/e2e.sqlite`, not `data/dev.sqlite`. Do not point test-mode or destructive reset commands at production/shared data. Reports and traces may contain private booking URLs, cookies, or customer details; keep them private.
