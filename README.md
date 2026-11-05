# SpaceBook

**Playwright + TypeScript QA Automation Portfolio**

SpaceBook is a purpose-built full-stack web application used to demonstrate a Playwright automation framework. The main focus of this repository is test automation: UI, API, end-to-end, and controlled-failure testing.

The application uses React, Express, and SQLite. It runs locally and requires no external database or cloud services.

## 1. Run the Playwright tests

**Prerequisites:** Node.js 22.13+ and npm.

```bash
git clone https://github.com/nataliia-makova/spacebook-playwright.git
cd spacebook-playwright
npm ci
npx playwright install chromium
npx playwright test
```

**You do not need to start the web app first.** Playwright builds and launches it automatically if it is not running. Both the VS Code Playwright extension and the CLI reuse the same **verified local app** at `http://127.0.0.1:3001` when it is already running. Use the extension and CLI **sequentially**, not as simultaneous independent suites. CI starts a fresh server.

The 20 tests cover UI, API, authorization, controlled errors/retries and an E2E booking lifecycle. Fixtures create unique test resources and clean them up. **Playwright never automatically resets the database.** A force-terminated test run may leave test-created records behind.

Run specific tests:

```bash
npx playwright test --project=api
npx playwright test --project=chromium
npx playwright test --grep @security
npx playwright test --grep @recovery
```

View the HTML report:

```bash
npx playwright show-report automation/playwright-report
```

## 2. Explore the application manually (optional)

To use SpaceBook without Playwright:

```bash
npm run local
```

Open **http://127.0.0.1:3001/spaces** to browse, sign up, book, view My Bookings or cancel. Stop the server with **Ctrl+C**.

Vite **builds** the React frontend; the Express process **serves both** the frontend and API on port 3001. The single SQLite file is `data/spacebook.sqlite`; migrations and example spaces are applied/seeded on startup. Existing records persist across restarts. No second running Vite server or external database is required.

If an older `.env` exists, update it to match `.env.example`: `APP_ENV=local`, `DB_PATH=./data/spacebook.sqlite`, `PORT=3001` and `APP_ORIGIN=http://127.0.0.1:3001`. If Playwright cannot reuse a server, ensure the old server has stopped and launch `npm run local` again. The guarded readiness URL is `/api/test-support/ready`; Playwright only recognizes the expected local port, origin, mode and database.

**Local-only safety:** Test-support endpoints create and permanently delete records. They are accessible only on loopback in this local application; never expose port 3001 publicly or deploy this configuration. Fixture cleanup targets test-owned records. Your manual records normally persist, but concurrent test runs against the same database are not supported.

To deliberately erase **all local accounts and bookings**, stop the server and then run `npm run db:reset`. This command is destructive and is **never part of Playwright startup**.

## 3. Additional quality checks

```bash
npm run typecheck
npm run lint
npm run test:backend
npm run build
npx playwright test --list
```

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

**Test safety:** The app and Playwright share `data/spacebook.sqlite` on loopback port 3001. Playwright never resets it; per-test cleanup deletes test-owned resources. Crashes can leave leftovers. **`npm run db:reset` deletes all data in the configured local SQLite file**, including manual bookings: stop the server and use it only deliberately. Test-support routes are enabled for localhost testing, not public hosting; this is an intentional local-portfolio configuration distinct from the original isolated-test-mode requirements. Reports and traces may contain private booking URLs, cookies, or customer details; keep them private.
