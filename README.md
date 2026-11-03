# SpaceBook

A small full-stack creative-space booking application. Built against [the first-release application requirements](https://github.com/makonat/spacebook-playwright/blob/docs/application-requirements/docs/application-requirements.md); the approved booking mockup supplies the ivory, dark-type and deep-green visual direction.

**v1.1 implemented:** Public sign-up/sign-in, persisted sessions, protected booking ownership and My Bookings, with local build, backend, and representative desktop/mobile checks recorded below. See [Authentication & My Bookings requirements](docs/authentication-my-bookings-requirements.md). The application still has no payments, notifications, or admin screens. A Playwright/TypeScript automation framework covers the browser UI, API, recovery behavior, and a full booking lifecycle.

## Requirements

- Node.js **22.13+**, npm, and an OS with SQLite support in Node. On macOS 11 Big Sur use the pinned Vite `6.4.5` and tsx `4.20.6` versions; Node 22 emits a normal experimental SQLite warning.
- No external services. A single SQLite file holds the application data. No DB daemon is needed.
- All booking times are for **Europe/Warsaw**; money is **EUR in integer cents**.

## Install and run

From the repository root:

```sh
npm install
cp .env.example .env
npm run db:migrate         # create/update SQLite tables
npm run db:seed            # idempotent three-space seed
npm run dev                # prepares DB; Vite :5173 and API :3001
```

Open **http://localhost:5173/spaces** or **http://127.0.0.1:5173/spaces** in development. The Vite development server proxies `/api` to Express; both processes start with `npm run dev` and stop together. Bookings survive ordinary restarts. Seed never removes bookings or duplicates the seeded spaces. Seed data includes photography, rehearsal and podcast spaces with different capacities and rates and locally bundled imagery. The Daylight Studio image is cropped from the provided approved mockup; the other two images are bundled SVG illustrations.

Other commands:

```sh
npm run typecheck         # strict client/server TypeScript
npm run build             # typecheck, compile Node API, build Vite frontend
npm start                 # serve API + dist SPA, after npm run build
npm run test:backend      # focused Node HTTP/SQLite acceptance checks
npm run db:prepare        # migrate + seed
npm run db:reset          # destructive, local ./data DB only (never production)
```

For a built production application, set `APP_ENV=production`, `APP_ORIGIN=https://your-origin.example`, `DB_PATH=/path/to/writable/app.sqlite`, and `PORT` before `npm run db:prepare` and `npm start`. The Express server binds to `127.0.0.1` (use a trusted reverse proxy if deployed); never enable test mode on public deployments. A production build serves the SPA at the same origin as the API. `APP_ORIGIN` determines private booking URLs; configure it to match the browser's actual origin. Production is not deployed as part of this branch.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development`, `test`, `production` |
| `DB_PATH` | `./data/dev.sqlite` (`./data/test.sqlite` if test mode and omitted) | Absolute or repo-relative SQLite path |
| `APP_ORIGIN` | `http://localhost:5173` | Browser origin used in private links; required in production |
| `PORT` | `3001` | Express API port |

`.env` is loaded by the server and scripts and is excluded from git. The frontend never receives credentials or the database path. Do not place personal data, private booking URLs, or submission identifiers into application logs. The API logs only a generic error class on unexpected server errors.

## Isolated test mode

Use a **different DB_PATH** from normal development data, for example:

```sh
APP_ENV=test DB_PATH=./data/test.sqlite npm run db:prepare
APP_ENV=test DB_PATH=./data/test.sqlite npm run dev:api
# In another terminal, optional browser frontend:
npm run dev:web
```

The test-only application endpoints exist only with `APP_ENV=test`:

- `POST /api/test-support/spaces` — create a space from the documented validated contract (201).
- `DELETE /api/test-support/bookings/:bookingId` — permanent deletion with submission-key cascade (204, including absent IDs).
- `DELETE /api/test-support/spaces/:spaceId` — delete an empty space (204) or refuse while **any** booking references it (409), even if cancelled.
- `DELETE /api/test-support/users/:userId` — remove a test account after deleting its bookings (204).

They always return `404` outside test mode; switching on generic frontend dev mode does not enable them. Test mode refuses the default development database path. Do not run test mode against real or shared data.

## Automated testing and CI

SpaceBook's Playwright/TypeScript framework contains **20 tests**: **9 UI**, **6 API**, **4 recovery/isolation**, and **1 full E2E lifecycle** (sign up → book → verify UI/API/SQLite → cancel → verify again). Six separate backend tests run with `npm run test:backend`. Playwright starts the app in test mode and resets only the disposable `data/e2e.sqlite` database. Test-scoped fixtures create isolated customers and spaces; `TestDataManager` discovers and cleans up bookings, spaces, and accounts after each test.

### Test architecture

- `automation/tests/`: concise business-readable specifications in `ui/`, `api/`, `mocked/`, and `e2e/`.
- `automation/flows/`: scenario actions, `test.step()` reporting, and assertions.
- `automation/pages/` and `automation/api/`: UI locators/actions and HTTP clients.
- `automation/fixtures/`: test-scoped setup, authentication, and cleanup.
- `automation/data/` and `automation/support/`: factories, test-data lifecycle, configuration, and read-only SQLite assertions.

### Tags and commands

Playwright's native tags select tests by purpose. They may overlap. **Only `@pr` is selected in GitHub Actions**; the other tags demonstrate focused selection and are run manually. Full regression needs no tag: just run all tests.

| Tag | Purpose | Selected tests | CI |
|---|---|---|---|
| `@pr` | Fast PR API validation | API-01 through API-06 (6) | Automated PR checks and manual workflow dispatch |
| `@hourly` | Example of a critical UI/API smoke suite | UI-01, UI-02, UI-06, API-03, API-06 (5) | No hourly schedule |
| `@security` | Authentication, authorization, account isolation | UI-09, API-05, API-06, MOCK-04 (4) | Manual only |
| `@recovery` | Error and retry behavior | MOCK-01, MOCK-02, MOCK-03 (3) | Manual only |

```sh
npm run typecheck
npm run lint
npm run test:backend
npx playwright install chromium               # one-time local install for UI tests
npx playwright test --project=api --grep @pr    # PR suite, 6 API tests
npx playwright test --grep @hourly              # critical smoke example, 5 tests
npx playwright test --grep @security            # 4 tests
npx playwright test --grep @recovery            # 3 tests
npx playwright test                             # full 20-test regression
npx playwright test --workers=2 --repeat-each=3 # optional stability check
```

### GitHub Actions: SpaceBook PR Tests

The **single** workflow, `.github/workflows/playwright.yml`, runs on **pull requests targeting `main`** and via **manual `workflow_dispatch`**. There are no push or scheduled workflows. It runs `npm ci`, typecheck, lint, six backend tests, build, and `npx playwright test --project=api --grep @pr` with one worker. Chromium is **not** installed for PR checks because only API tests are selected.

The Playwright HTML report is uploaded as `playwright-report` for 7 days, with failure logs and diagnostics in GitHub Actions. Locally, inspect `automation/playwright-report` or use `npx playwright show-trace <path-to-trace.zip>`. Reports can contain screenshots, traces, cookies, private links and request data; treat them as sensitive. The configured Chromium UI tests and tagged smoke suite run only when invoked manually. All Playwright checks launch an isolated local test application rather than monitoring a live production deployment.

### Normal API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/spaces?type=&minCapacity=` | Filtered spaces, sorted by name and ID |
| GET | `/api/spaces/:spaceId` | Space details |
| GET | `/api/spaces/:spaceId/availability?date=YYYY-MM-DD&durationHours=2` | Current available start/end times |
| POST | `/api/bookings` | **Signed-in** reservation, with UUID `Idempotency-Key` header |
| GET | `/api/bookings/:token` | Private booking information |
| POST | `/api/bookings/:token/cancel` | Idempotent cancellation |

Create booking payload:

```json
{
  "spaceId":"b74cbf47-296b-46e9-84d1-358b6ce51201",
  "date":"2026-11-12",
  "startTime":"12:00",
  "durationHours":2
}
```

The date in this example is illustrative and must still be in the future when submitted. API successes and error codes/statuses are defined in the linked application requirements. For new reservations the name and email are **derived from the signed-in user session**, not sent in the booking payload. Booking totals come only from stored rates. Public responses never include customer details, private booking links, or idempotency keys. Bookings store the rate/name snapshot and UTC instants; Europe/Warsaw date/time calculations use Luxon with ambiguous/nonexistent DST times excluded. SQLite `BEGIN IMMEDIATE` protects overlap validation, insert, and idempotency storage across database connections. Foreign keys are enabled on every connection.

### Authentication and My Bookings (v1.1)

Visitors can browse and inspect availability without an account. When a guest chooses a slot and clicks **Sign in to book**, they are sent to `/auth?mode=signin` with a validated internal `returnTo` destination and may switch to **Sign up**. After successful authentication they return to the space with their date, duration, and selected time restored, and must explicitly confirm the booking once availability has been checked again.

The header's **SpaceBook** logo returns to `/spaces`; the duplicate header **Browse spaces** link has been removed. Guests click **Account** to open the shared authentication screen directly, with Sign in selected. Mode switches preserve the entered email and full name while clearing passwords, confirmation, and errors. The return destination survives mode switches and clicking Account again on the authentication screen.

Signed-in users open the account menu for **My Bookings** or **Sign out**. Selecting My Bookings closes the menu, including when already on that screen and when using the keyboard. Successful sign-out clears the account and navigates to `/spaces`, replacing the current history entry; a failed sign-out keeps the current page and offers retry. Guests opening `/my-bookings` directly still see **Sign in to see your bookings.** with a return link. Registered users see upcoming, past, and cancelled reservations; only future confirmed reservations can be cancelled.

Authentication validation runs in the frontend and backend using the shared schemas:

| Field | Sign in | Sign up |
|---|---|---|
| Full name | Not shown | 1–100 characters after trimming |
| Email | Required valid email; maximum 254 characters after trimming | Same; normalized to lowercase |
| Password | Nonempty; no field-specific maximum | 6–128 characters, without trimming |
| Confirm password | Not shown | Client-only; empty: **Please confirm your password.**; different: **Passwords do not match.**; matching: no confirmation error |

Email is normalized to lowercase for both modes. Name and email inputs cap typing at 100 and 254 characters respectively. Password and confirmation inputs have no HTML length caps; signup's password range is checked on submission. Confirmation is not sent to the server. Invalid submissions focus the first invalid field.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Register `{fullName,email,password}`, return 201 and create session |
| POST | `/api/auth/signin` | Log in `{email,password}`, return 200 and create session |
| GET | `/api/auth/me` | Current user; 401 if not signed in |
| POST | `/api/auth/signout` | Revoke session; idempotent 204 |
| GET | `/api/me/bookings` | Account-owned bookings only |
| DELETE | `/api/test-support/users/:userId` | Test mode only; delete account after its bookings are permanently deleted |

**Security and persistence:** Passwords use salted Node `scrypt` hashes. Sessions live in SQLite, expire after seven days, and use HttpOnly SameSite=Lax cookies (also `Secure` under HTTPS). Cookie-authenticated mutations require the configured application `Origin` to match. In development only, `localhost`, `127.0.0.1`, and `[::1]` are interchangeable when the protocol and port match `APP_ORIGIN`. Sign-up passwords must contain 6–128 characters. Failed sign-in/up attempts are bounded with a persisted per-IP/email throttle. Booking endpoints enforce ownership on the server; a private token alone does not authorize an **account-owned** booking. Pre-upgrade guest reservations remain accessible through their existing private links, and existing submission identifiers still replay. No public password-reset service or email verification is provided in this demo release.

The database migration `002_accounts.sql` is additive; run `npm run db:migrate` against an existing development SQLite file to preserve bookings. Do not reset the database to add accounts.

### Layout and refresh behavior

Browse, space details, booking confirmation, authentication, and My Bookings use compact spacing and responsive layouts. The seeded baseline screens were checked at 1280×720 and 1366×768 without unnecessary vertical scrolling, with no horizontal overflow in mobile checks down to 320px. Narrow screens, longer booking lists, and additional error messages can require normal vertical scrolling.

Filter changes keep the previous cards visible with **Updating spaces…** until the read completes. Availability refreshes keep time-slot buttons rendered but disabled while checking. Booking confirmation and My Bookings retain the last successful content during status refreshes and disable cancellation actions while the refresh is pending. These behaviors prevent the loading-time layout collapse that caused upward scroll jumps.

### Safe retry contract

When a booking cannot be verified due to a connection loss, timeout or 500, the browser keeps the exact payload, originating account ID, and UUID submission key in **sessionStorage** and disables edits. Retry sends that *same* operation; a successful replay returns 200 and the original booking. After a definite 400/409, the form is editable and can generate a new key for a changed request; customer identity continues to come from the signed-in account. If sessionStorage cannot persist the key, submission is blocked rather than risk duplicate reservations. Reopening the original booking link displays its current server status; the private link must be kept confidential. Cancellation retries use the server's idempotent cancellation endpoint and never optimistically update the screen.

## Acceptance coverage and constraints

Implemented: combined browse filters, space details/equipment/hours, whole-hour 1–4 hour bookings, server-future validation, non-overlap with adjacent intervals, real transaction locking, server-priced totals, private confirmation, idempotent replay (including cancelled bookings), cancellation, missing-resource/error/retry states, test-only creation and permanent deletion, repeatable seed, accessible form labels and focus, 10-second browser request timeouts, and responsive screens.

The backend suite has six tests: an HTTP/SQLite integration test in `server/tests/api.test.ts` and five origin-validation tests in `server/tests/auth.test.ts`. Coverage includes authentication, six-character password acceptance and shorter-password rejection, ownership, persisted data, simultaneous conflicting bookings against **two SQLite connections**, replay and changed-key rejection, adjacency, cancellation, daylight-saving invalid local times, and isolated cleanup. Origin checks cover development loopback aliases, matching protocol/port, invalid/external origins, and strict test/production matching. The current Playwright framework adds browser, API, recovery/isolation, and full UI/API/SQLite lifecycle coverage to these backend tests.

**Limitations:** The local checks below cover representative journeys and are not an exhaustive release acceptance suite. Local installation needs access to npm. This source tree intentionally omits generated `node_modules` and `dist` files. Node 22's built-in SQLite implementation may emit an experimental warning; Node 24 LTS is recommended for production. The application does not include real image uploads or email ownership verification (both excluded by the spec). A lost browser sessionStorage state cannot be recovered by the server without the original private URL/key; users should keep their private confirmation link.

## Historical local verification record (2026-10-30)

These historical results predate the committed Playwright framework. Later v1.1 manual verification is recorded below; current automated coverage is documented in **Automated testing and CI**.

- **Passed:** TypeScript transpilation/parser check over all 12 TS/TSX source files: 0 syntax diagnostics (this is **not** a full type check).
- **Passed:** Node's SQLite engine applied `migrations/001_initial.sql`, inserted a booking, enforced `PRAGMA foreign_keys=ON`, and rejected deletion of a referenced space.
- **Passed:** Two independent Node processes using `BEGIN IMMEDIATE` on one SQLite database raced for the same interval; one created the booking, one observed conflict, and exactly one persisted. This is a targeted database locking smoke check, not the full HTTP acceptance suite.
- **Blocked:** `npm install --offline` failed (`ENOTCACHED`); the online registry was unreachable from the sandbox. Consequently `npm run typecheck` and `npm run build` stop on missing Node/Vite type definitions; `npm run test:backend` cannot start because `tsx` is not installed. A package-lock file could not be generated.
- **Not run:** Full HTTP acceptance suite and manual browser/UI checks, including error/retry and a narrow viewport, require dependencies and a runnable frontend. No lint script is configured.

This historical syntax/database smoke check alone did not establish release acceptance.

## v1.1 verification record (2026-11-01)

- **Passed:** `npm run typecheck`, `npm run build`, and all six tests from `npm run test:backend` during local verification. TypeScript and browser confirmation-message checks also passed after the final validation wording update.
- **Passed:** Browser layout checks for browse, all three seeded spaces, sign-in, sign-up, guest/empty/populated My Bookings, booking confirmation, and missing-page/booking states. Desktop sizes included 1280×720, 1366×768, and 1024×768; mobile checks included 390×844 and 320×568.
- **Passed with an isolated temporary database:** Sign-up, sign-in/sign-out, booking creation, cancellation, keeping a booking, empty-list behavior, and failed-read/retry recovery. Development bookings were not used as test data.
- **Passed with delayed reads:** Filter, availability, confirmation, and My Bookings refreshes retained page height and scroll position while pending; availability and cancellation actions were disabled as appropriate.
- **Passed with mocked authentication responses:** Direct guest Account access, email-preserving mode switches, cleared passwords on mode changes, booking return destinations and restored selections, successful/failed/pending sign-out navigation, and menu closure for navigation, same-page clicks, and keyboard activation.
- **Passed:** Empty confirmation displays **Please confirm your password.**; mismatched confirmation displays **Passwords do not match.**; matching confirmation clears the error and permits submission. Invalid confirmation blocks requests and focuses the confirmation field when earlier fields are valid.
- **Passed against the running development API:** Signup requests from both `localhost:5173` and `127.0.0.1:5173` passed origin validation; an external origin was rejected with `403 INVALID_ORIGIN`.
- At the time of this historical record, browser checks used connected Playwright browser tools, before the committed framework and CI workflow were added. Production deployment and exhaustive release acceptance are not covered by this record.
