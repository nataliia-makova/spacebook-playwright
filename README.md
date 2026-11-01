# SpaceBook

A small full-stack creative-space booking application. Built against [the first-release application requirements](https://github.com/makonat/spacebook-playwright/blob/docs/application-requirements/docs/application-requirements.md); the approved booking mockup supplies the ivory, dark-type and deep-green visual direction.

The release deliberately does **not** implement accounts, payments, notifications, admin screens or an automation framework.

**Planned v1.1 enhancement (requirements only):** [Authentication and My Bookings](docs/authentication-my-bookings-requirements.md) covers public sign-up/sign-in, authenticated booking ownership, account sessions and a My Bookings screen. These features are **not implemented** in the current release; this document is a specification for subsequent work.

## Requirements

- Node.js **22.13+** (prefer current Node 24 LTS for non-experimental `node:sqlite`), npm, and an OS with SQLite support in Node.
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

Open **http://localhost:5173/spaces**. The Vite development server proxies `/api` to Express; both processes start with `npm run dev` and stop together. Bookings survive ordinary restarts. Seed never removes bookings or duplicates the seeded spaces. Seed data includes photography, rehearsal and podcast spaces with different capacities and rates and locally bundled imagery. The Daylight Studio image is cropped from the provided approved mockup; the other two images are bundled SVG illustrations.

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

They always return `404` outside test mode; switching on generic frontend dev mode does not enable them. Test mode refuses the default development database path. Do not run test mode against real or shared data.

### Normal API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/spaces?type=&minCapacity=` | Filtered spaces, sorted by name and ID |
| GET | `/api/spaces/:spaceId` | Space details |
| GET | `/api/spaces/:spaceId/availability?date=YYYY-MM-DD&durationHours=2` | Current available start/end times |
| POST | `/api/bookings` | Reserve, with UUID `Idempotency-Key` header |
| GET | `/api/bookings/:token` | Private booking information |
| POST | `/api/bookings/:token/cancel` | Idempotent cancellation |

Create booking payload:

```json
{
  "spaceId":"b74cbf47-296b-46e9-84d1-358b6ce51201",
  "date":"2026-11-12",
  "startTime":"12:00",
  "durationHours":2,
  "customerName":"Anna Kowalska",
  "customerEmail":"anna@example.com"
}
```

The date in this example is illustrative and must still be in the future when submitted. API successes and error codes/statuses are defined in the linked application requirements. Booking totals come only from stored rates. Public responses never include customer details, private booking links, or idempotency keys. Bookings store the rate/name snapshot and UTC instants; Europe/Warsaw date/time calculations use Luxon with ambiguous/nonexistent DST times excluded. SQLite `BEGIN IMMEDIATE` protects overlap validation, insert, and idempotency storage across database connections. Foreign keys are enabled on every connection.

### Safe retry contract

When a booking cannot be verified due to a connection loss, timeout or 500, the browser keeps the exact payload and UUID submission key in **sessionStorage** and disables edits. Retry sends that *same* operation; a successful replay returns 200 and the original booking. After a definite 400/409, the form is editable, keeps customer details and can generate a new key for a changed request. If sessionStorage cannot persist the key, submission is blocked rather than risk duplicate reservations. Reopening the original booking link displays its current server status; the private link must be kept confidential. Cancellation retries use the server's idempotent cancellation endpoint and never optimistically update the screen.

## Acceptance coverage and constraints

Implemented: combined browse filters, space details/equipment/hours, whole-hour 1–4 hour bookings, server-future validation, non-overlap with adjacent intervals, real transaction locking, server-priced totals, private confirmation, idempotent replay (including cancelled bookings), cancellation, missing-resource/error/retry states, test-only creation and permanent deletion, repeatable seed, accessible form labels and focus, 10-second browser request timeouts, and responsive screens.

The focused backend test (`server/tests/api.test.ts`) exercises HTTP codes, filtering, persistence after DB reopen, simultaneous conflicting booking requests against **two SQLite connections**, replay and changed-key rejection, adjacency, cancellation, daylight-saving invalid local times, and test-support mode/deletion integrity. No Playwright, fixtures, browser mocks, CI workflow, or artificial failure routes are included.

**Limitations:** Local installation needs access to npm. This source tree intentionally omits generated `node_modules` and `dist` files. Node 22's built-in SQLite implementation may emit an experimental warning; Node 24 LTS is recommended for production. The application does not include real image uploads or email ownership verification (both excluded by the spec). A lost browser sessionStorage state cannot be recovered by the server without the original private URL/key; users should keep their private confirmation link.

## Local verification record (2026-10-30)

- **Passed:** TypeScript transpilation/parser check over all 12 TS/TSX source files: 0 syntax diagnostics (this is **not** a full type check).
- **Passed:** Node's SQLite engine applied `migrations/001_initial.sql`, inserted a booking, enforced `PRAGMA foreign_keys=ON`, and rejected deletion of a referenced space.
- **Passed:** Two independent Node processes using `BEGIN IMMEDIATE` on one SQLite database raced for the same interval; one created the booking, one observed conflict, and exactly one persisted. This is a targeted database locking smoke check, not the full HTTP acceptance suite.
- **Blocked:** `npm install --offline` failed (`ENOTCACHED`); the online registry was unreachable from the sandbox. Consequently `npm run typecheck` and `npm run build` stop on missing Node/Vite type definitions; `npm run test:backend` cannot start because `tsx` is not installed. A package-lock file could not be generated.
- **Not run:** Full HTTP acceptance suite and manual browser/UI checks, including error/retry and a narrow viewport, require dependencies and a runnable frontend. No lint script is configured.

Run `npm install`, `npm run typecheck`, `npm run build`, `npm run test:backend`, and a browser pass (desktop and 390px wide, including a real failed-read/retry condition) in a network-enabled development environment before approving the release. Do not interpret the syntax or direct SQL smoke checks as complete release verification.
