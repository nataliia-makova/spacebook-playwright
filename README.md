# SpaceBook

**Playwright + TypeScript QA Automation Portfolio**

SpaceBook is a purpose-built full-stack web application used to demonstrate a Playwright automation framework. The main focus of this repository is test automation: UI, API, end-to-end, and controlled-failure testing.

The application uses React, Express, and SQLite. It runs locally and requires no external database or cloud services.

## 1. Try the web application manually

**Prerequisites:** Node.js 22.13+ and npm.

Clone the repository and start SpaceBook:

```bash
git clone https://github.com/nataliia-makova/spacebook-playwright.git
cd spacebook-playwright
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/spaces** in your browser.

You can now:

1. Browse available creative spaces as a guest.
2. Sign up for a new account or sign in.
3. Select an available date and time and book a space.
4. Open My Bookings to view your reservations.
5. Cancel a reservation and verify its status.

The command automatically starts the Vite frontend and Express backend, initializes the development SQLite database (`data/dev.sqlite`), and seeds example spaces. Your bookings persist across normal application restarts.

**Stop the application using Ctrl+C** when finished.

Configuration is optional for local development. Copy `.env.example` to `.env` only if you need to override `APP_ENV`, `DB_PATH`, `PORT`, or `APP_ORIGIN`.

## 2. Run the Playwright automation tests

**Important:** Stop the manually running application before starting the tests.

Playwright automatically starts its own frontend and backend and uses an isolated, disposable test database (`data/e2e.sqlite`). The tests do not modify your manual development bookings.

Install the browser (first time only):

```bash
npx playwright install chromium
```

Run the complete suite:

```bash
npx playwright test
```

The suite contains **20 Playwright tests**, covering UI functionality, API behavior, account isolation, error recovery, and a complete booking journey.

Run specific test groups:

```bash
npx playwright test --project=api
npx playwright test --project=chromium
npx playwright test --grep @security
npx playwright test --grep @recovery
```

Open the HTML report:

```bash
npx playwright show-report automation/playwright-report
```

Playwright captures traces and screenshots for failed tests. The browser suite uses Chromium and the `Europe/Warsaw` timezone.

## 3. Additional quality checks

```bash
npm run typecheck
npm run lint
npm run test:backend
npm run build
npx playwright test --list
```

For framework design, test coverage, CI configuration, and project structure, see the sections below.

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

**Test safety:** Playwright's startup resets only the disposable `data/e2e.sqlite`, not the development database. **Running `npm run db:reset` manually deletes the configured local SQLite database**—by default, `data/dev.sqlite`, including existing bookings; a custom `DB_PATH` changes the target. Never reset production or shared data. Reports and traces may contain private booking URLs, cookies, or customer details; keep them private.
