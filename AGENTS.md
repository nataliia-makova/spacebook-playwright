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

The app uses **React built with Vite**, **one Express process serving UI and API on port 3001**, and **one SQLite file** (`data/spacebook.sqlite`) via Node's built-in `node:sqlite`. `npm run local` builds and starts the single application. No external services are required.

## Application invariants

- Preserve server-owned authentication and authorization: HttpOnly cookie sessions and account ownership for booking details, listing, and cancellation. Enforce origin validation for normal API mutations. Test-support routes are local-only (or available in the legacy isolated backend test mode); they require a loopback connection and reject foreign origins. Do not expose the local server publicly.
- Booking creation uses a UUID `Idempotency-Key`: identical retries return the original booking; changed payloads or conflicting slots are rejected. Never silently bypass this contract.
- All customer-facing booking times are in `Europe/Warsaw`; timestamps stored in SQLite are UTC. Use Luxon to handle timezone/DST boundaries.
- Prices are EUR **integer cents**; compute totals on the server rather than trusting client input.
- Use shared Zod schemas/contracts from `shared/contracts.ts` for API validation. Database changes belong in additive `migrations/` files, not ad hoc schema resets.
- `/api/test-support/*` routes are available only to loopback clients for the local automation application (and the legacy isolated backend test mode). Production/development modes cannot access them. The guarded readiness endpoint verifies the local mode, port, origin and database. Do not publish the local server.
- Never commit or expose real credentials, production data, session cookies, or private confirmation tokens. Use synthetic accounts and booking data in test fixtures. Treat Playwright reports, screenshots, and traces as potentially sensitive artifacts.

## Playwright design rules

**Specs are business narratives.** Preserve descriptive test names (`UI-xx`, `API-xx`, `MOCK-xx`, `E2E-xx`) and keep `.spec.ts` bodies to business-readable `await flow.method(scenario)` calls. No direct `expect()`, route handlers, HTTP calls, SQL, intermediate `const` values, or helper implementations in spec bodies.

- Put `test.step()`, technical variables, validation and assertions inside **flow** methods.
- Put locators, navigation and UI actions inside **page objects**.
- Put HTTP headers, endpoints, response status handling and transport inside **API clients**; flow methods may assert API semantics.
- Put setup/scenarios in **test-scoped fixtures**; use `automation/data/factories.ts` to create unique users, spaces and future dates.
- Use **`TestDataManager`** for automatic cleanup; discover browser-created bookings/accounts during teardown. Avoid global mutable state, shared users, order-dependent tests, and unnecessary abstractions.
- Use real API/backend behavior whenever the scenario requires it. Mock or intercept only the deliberate failure under test (for example, the first 500 or an aborted browser response). Keep routes scoped and reliably release/remove them.
- Prefer accessible role/label locators and Playwright auto-waiting over sleeps or arbitrary timeouts. Never weaken assertions just to make CI green.
- `automation/support/BookingDatabase.ts` is a **read-only** test helper for the shared local SQLite file; it must never write, migrate or reset the database.

## Test data, execution, and safety

Playwright uses `APP_ENV=local`, `DB_PATH=./data/spacebook.sqlite`, and `APP_ORIGIN=http://127.0.0.1:3001`. It starts `npm run local` on demand and reuses a guarded, verified existing local server outside CI. The browser and API projects use the same origin. Fixtures create unique resources and delete them after each test; **do not reset the database at startup**. Sequential extension/CLI use is supported; do not run independent test suites concurrently.

**Warning:** `npm run db:reset` deletes all records in the configured local SQLite file, including manual bookings. Stop the app before using it. If an existing `.env` still contains old settings, update it to match `.env.example`. The single-mode localhost setup is intentionally local-only; unlike the original application requirements, its test-support endpoints are also available for manual use on loopback. Do not deploy this server.

**Test selection and CI:**
- `@pr` — fast API checks executed by the PR workflow.
- `@hourly` — illustrative critical UI/API smoke selection; **not scheduled**.
- `@security` — authorization and account-isolation scenarios.
- `@recovery` — failure and retry scenarios.
- Full regression — `npx playwright test` (no special tag).

CI runs on pull requests targeting `main` and through manual dispatch. Consult `.github/workflows/playwright.yml` for authoritative commands and triggers; do not add new triggers without explicit authorization.

## Before completing a change

Run the smallest relevant checks first, then as appropriate:

```bash
npm run typecheck
npm run lint
npm run test:backend
npx playwright test --project=api --grep @pr
npx playwright test                     # full regression for framework/app changes
```

Report files changed and **actual** verification results, including commands that could not be run. Preserve app behavior, existing coverage, and cleanup; avoid unrelated refactors. Do not commit, push, merge, or modify workflows unless the user explicitly authorizes those actions.
