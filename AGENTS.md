# SpaceBook repository guidance for coding agents

This file is for assistants and coding agents modifying the **application or Playwright test framework**. For human setup instructions, test commands, and a concise overview, start with [README.md](README.md).

## Repository map

| Location | Responsibility |
|---|---|
| `src/main.tsx` | React routes, space discovery/details, booking form and confirmation |
| `src/accounts.tsx` | Authentication, account menu and My Bookings |
| `src/http.ts` | Frontend HTTP requests, read/retry behavior |
| `server/app.ts` | Express REST API, booking rules and test-only endpoints |
| `server/auth.ts` | Server-managed sessions and authentication |
| `server/db.ts`, `migrations/` | SQLite connections, transactions, schema evolution |
| `server/tests/` | Backend HTTP/SQLite tests |
| `shared/contracts.ts` | Shared API contracts, Zod schemas, constants |
| `automation/tests/` | Playwright specs grouped as `ui/`, `api/`, `mocked/`, `e2e/` |
| `automation/flows/` | Business workflows, assertions and `test.step()` |
| `automation/pages/` | Page-object locators and browser interactions |
| `automation/api/` | Playwright request clients and HTTP transport |
| `automation/fixtures/` | Test-scoped scenarios and dependencies |
| `automation/data/` | Test-data factories |
| `automation/support/` | `TestDataManager`, config and read-only SQLite assertions |
| `playwright.config.ts` | Projects, isolated test server and reports |
| `.github/workflows/playwright.yml` | One PR-only CI workflow (API tests tagged `@pr`) |

The app is **React + Vite** on port **5173**, **Express** on port **3001**, and **SQLite** via Node's built-in `node:sqlite`. Vite proxies `/api` to the backend. No external services are required.

## Application invariants

- Preserve server-owned authentication and authorization: HttpOnly cookie sessions, account ownership for booking detail/list/cancellation, and exact-origin protection for mutations.
- Booking creation uses a UUID `Idempotency-Key`: identical retries return the original booking; changed payloads or conflicting slots are rejected. Never silently bypass this contract.
- All customer-facing booking times are in `Europe/Warsaw`; timestamps stored in SQLite are UTC. Use Luxon to handle timezone/DST boundaries.
- Prices are EUR **integer cents**; compute totals on the server rather than trusting client input.
- Use shared Zod schemas/contracts from `shared/contracts.ts` for API validation. Database changes belong in additive `migrations/` files, not ad hoc schema resets.
- `/api/test-support/*` routes are for isolated `APP_ENV=test` only. Do not expose test-only controls in production.
- Do not leak credentials, session cookies, private confirmation tokens, or test data in logs, fixtures, documentation, or public reports.

## Playwright design rules

**Specs are business narratives.** Preserve descriptive test names (`UI-xx`, `API-xx`, `MOCK-xx`, `E2E-xx`) and keep `.spec.ts` bodies to business-readable `await flow.method(scenario)` calls. No direct `expect()`, route handlers, HTTP calls, SQL, intermediate `const` values, or helper implementations in spec bodies.

- Put `test.step()`, technical variables, validation and assertions inside **flow** methods.
- Put locators, navigation and UI actions inside **page objects**.
- Put HTTP headers, endpoints, response status handling and transport inside **API clients**; flow methods may assert API semantics.
- Put setup/scenarios in **test-scoped fixtures**; use `automation/data/factories.ts` to create unique users, spaces and future dates.
- Use **`TestDataManager`** for automatic cleanup; discover browser-created bookings/accounts during teardown. Avoid global mutable state, shared users, order-dependent tests, and unnecessary abstractions.
- Use real API/backend behavior whenever the scenario requires it. Mock or intercept only the deliberate failure under test (for example, the first 500 or an aborted browser response). Keep routes scoped and reliably release/remove them.
- Prefer accessible role/label locators and Playwright auto-waiting over sleeps or arbitrary timeouts. Never weaken assertions just to make CI green.
- `automation/support/BookingDatabase.ts` is a **read-only** test helper; keep database verification isolated to the Playwright test database.

## Test data, execution, and safety

`playwright.config.ts` starts `npm run db:reset && npm run dev` with `APP_ENV=test`, `APP_ORIGIN=http://127.0.0.1:5173`, and `DB_PATH=./data/e2e.sqlite`. Playwright uses `chromium` for `ui/`, `mocked/`, and `e2e/`, and `api` for `api/`. It resets the disposable test DB when the suite starts. Do **not** point test runs or reset scripts at `data/dev.sqlite`, production, or shared databases. Stop manual servers on ports 5173/3001 before running Playwright.

Existing tag conventions:
- `@pr`: six API tests, the only group selected by CI.
- `@hourly`: five critical UI/API scenarios; illustrative tag only, **not scheduled**.
- `@security`: four authorization/isolation scenarios; manual filtering only.
- `@recovery`: three fault-recovery scenarios; manual filtering only.
- Full regression: `npx playwright test` (no special tag).

The single **SpaceBook PR Tests** workflow runs on PRs targeting `main` and manual dispatch. It performs typecheck, lint, six backend tests, build and `npx playwright test --project=api --grep @pr`. Do not add push, nightly, or hourly triggers without a specific request.

## Before completing a change

Run the smallest relevant checks first, then as appropriate:

```bash
npm run typecheck
npm run lint
npm run test:backend
npx playwright test --project=api --grep @pr
npx playwright test                     # full 20-test suite for framework/app changes
```

Report files changed and **actual** verification results, including commands that could not be run. Preserve app behavior, existing coverage, and cleanup; avoid unrelated refactors. Do not commit, push, merge, or modify workflows unless the user explicitly authorizes those actions.
