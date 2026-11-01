# SpaceBook — Authentication & My Bookings requirements (v1.1)

**Status:** Implemented on `feat/demo-application`; local build, backend, and representative browser checks are recorded in the [README verification record](../README.md#v11-verification-record-2026-11-01).

**Target branch:** `feat/demo-application` (implementation and requirements).

**Baseline:** [First-release application requirements](https://github.com/makonat/spacebook-playwright/blob/docs/application-requirements/docs/application-requirements.md).

## Relationship to release 1

This document defines the implemented authentication and account-owned booking extension, including subsequent navigation, validation, and layout refinements. The first release intentionally allowed guest bookings with private confirmation links; this extension changes **new** booking creation to require an authenticated account. For topics not explicitly changed below, the first-release application requirements remain authoritative: space filtering, venue timezone (`Europe/Warsaw`), EUR integer-cent pricing, opening hours, DST exclusions, half-open overlap checking, real SQLite transactions, persistent idempotency, availability, cancellation timing, error handling, and isolated test-support boundaries.

Keep the application small: React/Vite, TypeScript, Express, SQLite, one frontend and one backend. No OAuth, external identity provider, email verification, password-reset emails, profile editor, payments, administrator UI, notifications, Playwright test framework, or CI workflows in this feature. The authentication extension should be implemented and verified independently of the future portfolio automation suite.

## User journeys

| ID | Acceptance criterion |
|---|---|
| AUTH-01 | Unauthenticated visitors can open `/` (redirecting to `/spaces`), browse/filter spaces, open details, choose a date/duration/start time, and view availability without signing in. Public space and availability API endpoints remain public. |
| AUTH-02 | The header presents a keyboard-operable **Account** control. For guests it opens the shared authentication screen directly, with **Sign in** selected and **Sign up** available inside. For signed-in users it opens a menu with **My Bookings** and **Sign out**. Selecting My Bookings closes the menu, including on the current page and with keyboard activation. The control reflects session changes and remains accessible at narrow widths. |
| AUTH-03 | A guest who chooses a valid slot and activates **Sign in to book** is sent to authentication rather than creating a booking. Their selected space, date, duration and time survive the login/signup redirect and a page reload in the same browser tab. Do not retain a password or a booking idempotency key just to redirect. |
| AUTH-04 | After successful sign-in or sign-up from a booking flow, return to the selected space, restore the selection, and refresh availability. If the slot is no longer valid, explain why, clear the invalid time selection, and ask the user to choose another; never submit automatically after authentication. |
| AUTH-05 | A guest can start authentication directly from the header Account control without selecting a space. After success, return to `/spaces` or the validated internal `returnTo` destination. Preserve that destination across mode switches and when Account is clicked again on `/auth`. |
| AUTH-06 | A signed-in user may browse as usual and confirm bookings without another authentication step. New bookings are owned by that account, and the server derives the booking's customer name/email from the authenticated user, not client-supplied identity fields. |
| AUTH-07 | A successful sign-up signs the user in immediately. Refreshing the page preserves the session until sign-out, server revocation, or expiration. |
| AUTH-08 | A user can sign out from the account menu. After successful sign-out, return to `/spaces`, replacing the current history entry, and protected pages/actions no longer expose account information. If sign-out fails, remain on the current page and offer retry. Other active sessions are not automatically invalidated. |
| AUTH-09 | `/my-bookings` lists **only** the signed-in user's reservations, including upcoming confirmed, past confirmed, and cancelled. Each row shows space name, venue date/time, total EUR amount, reference and status; View opens its details. Only future confirmed bookings show Cancel. |
| AUTH-10 | Cancel opens an accessible confirmation dialog. Dismissing it does nothing; confirming calls the server's existing cancellation operation. Status updates only after a successful response or a subsequently verified read. Cancellation retries remain idempotent. |
| AUTH-11 | A guest visiting `/my-bookings` is directed to sign in, with a safe return to that page. After a session expires, the UI shows a sign-in state, not stale private account data. |
| AUTH-12 | One account cannot read or cancel another account's bookings by guessing IDs, obtaining a URL, changing requests, or reusing another account's submission key. All ownership checks are enforced by the API. |
| AUTH-13 | Existing guest bookings and their pre-upgrade private links continue to work, including cancellation, subject to the original cancellation rules. Existing guest bookings do not automatically become associated with accounts merely because an email matches. |
| AUTH-14 | Unknown routes, unknown tokens, and non-owned account-booking links provide an unavailable/not-found state without disclosing other users' details. |
| AUTH-15 | The SpaceBook logo links to `/spaces` on every screen. The header has no duplicate Browse spaces link. Contextual back links and browse actions in empty/not-found states remain available. |

## Authentication screens and fields

Use **one responsive authentication screen**, `/auth`, with clearly labelled **Sign in** and **Sign up** modes (query `mode=signin` or `mode=signup`; default: sign in). This is a routed screen, not a modal. Both modes have persistent labels, visible keyboard focus, inline validation, accessible error announcements, and show/hide password controls. Switching modes preserves entered email and full name while clearing password, confirmation, field errors, and the form message.

| Field | Sign in | Sign up | Validation |
|---|---|---|---|
| Full name | Not shown | Required | Trim leading/trailing whitespace; 1–100 characters. |
| Email address | Required | Required | Trim and normalize to lowercase for identity; max 254 characters; same email-format rule as the existing application. Case-insensitive uniqueness in SQLite. |
| Password | Required | Required | Sign-up: 6–128 characters; do **not** trim or silently alter the password. Sign-in: at least 1 character, with no field-specific maximum in the current schema. |
| Confirm password | Not shown | Required | Check empty first, then exact equality with the password. No independent length limit. UI-only confirmation; do not persist, send to the API, or log it. |
| Show/hide password | Yes | Yes | Toggle visibility without changing the field value; keyboard accessible. |

**Form behavior:** Inline required/format/mismatch messages; focus first invalid field; preserve non-password fields after errors. Successful signup returns an authenticated session. An already registered signup email returns `409 EMAIL_ALREADY_REGISTERED` with a readable next step to sign in. Failed sign-in uses a generic `401 INVALID_CREDENTIALS` message, avoiding distinctions between unknown emails and wrong passwords. Display `429 RATE_LIMITED` for too many attempts, without claiming that account credentials are wrong. No "forgot password" flow in this release; describe that omission in the README.

| Confirmation condition | Exact inline message |
|---|---|
| Empty, including when the password is also empty | Please confirm your password. |
| Nonempty and different from the password | Passwords do not match. |
| Matches the password | No confirmation error; all other fields must still be valid |

Confirmation errors block signup and use the confirmation field's `aria-invalid`/`aria-describedby` association. Focus follows the field order: full name, email, password, confirmation. A matching confirmation clears its error on the next submission.

The shared schemas validate submissions in both frontend and backend. The form uses `noValidate` so these inline messages handle validation. Name and email inputs additionally enforce HTML `maxLength` values of 100 and 254. Password and confirmation inputs currently have no HTML `minLength` or `maxLength`; signup's 6–128 password range is enforced on submission. Authentication fields live in component state rather than application-managed persistent storage, so a page reload does not guarantee their restoration.

## UI routes

| Route | Behavior |
|---|---|
| `/`, `/spaces` | Existing public browse page; header adds account access. |
| `/spaces/:spaceId` | Existing public details/availability. Guests select a slot then authenticate to book; signed-in users can confirm. |
| `/auth?mode=signin` and `/auth?mode=signup` | Combined form, optional safe internal return destination. |
| `/my-bookings` | Authenticated list of the current user's bookings with View/Cancel actions. Loading, empty, retry and sign-in-required states. |
| `/bookings/:token` | Confirmation/details. Newly created account bookings require owner authentication for both viewing and cancelling. Legacy guest bookings retain original private-token access. |
| Unknown paths | Existing not-found screen linking back to browse. |

After logout or a genuine session expiration, don't disclose previously loaded account details from component state or caches. For an interrupted read, show Retry; for authentication failure, offer sign-in while preserving harmless navigation state. Show upcoming confirmed bookings (earliest start first), past confirmed bookings (most recent start first), and cancelled bookings (most recently cancelled first) as distinct sections or clearly labelled filters; all statuses must remain discoverable. Empty My Bookings shows a helpful link to browse.

Intentional successful sign-out navigates to `/spaces` with history replacement. A guest opening `/my-bookings` directly still sees **Sign in to see your bookings.** and a sign-in link returning to that page. Pending sign-out disables its action; failed sign-out retains the current account/page and displays **Could not confirm sign out. Please try again.**

## Layout and scroll behavior

- Browse, all seeded space details, confirmation, sign-in/sign-up, and My Bookings use compact headings, spacing, and cards. Desktop booking date/duration and signup fields use paired columns; detail photos are shorter and opening hours use two columns where space permits.
- Baseline desktop layouts were checked at 1280×720 and 1366×768 without unnecessary vertical scrolling. Mobile layouts allow normal vertical scrolling for stacked content and avoid horizontal overflow. Long booking lists and extra error messages may extend the page.
- Filter reads keep previous cards visible with **Updating spaces…** while loading. Replacing results with a short spinner during a filter refresh would collapse the page and can force the browser upward.
- Availability reads keep the time-slot grid rendered. While loading, slots are disabled and the legend shows **Checking availability…**; the booking action is disabled until availability is verified. Date/duration changes clear the previous time selection.
- Booking confirmation and My Bookings retain their last successful content during status refreshes, mark the result region busy, and disable cancellation while loading. Initial reads still show loading states, and failed reads expose recovery actions.

## API contract

All JSON request bodies have strict schemas (unexpected fields rejected with `400 VALIDATION_ERROR`) and the API limits JSON bodies to 20 KB. Use the existing error shape `{ "error": { "code", "message", "fieldErrors"? } }`. Use `401` for missing/expired sessions, `403 INVALID_ORIGIN` for rejected mutation origins, `409` for an already registered email, `429` for authentication throttling, and existing statuses for booking conflicts, late cancellation, missing resources, unexpected failures, etc.

| Method | Endpoint | Input | Success |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ fullName, email, password }` | `201 { user }`, plus a session cookie. Duplicate email: `409 EMAIL_ALREADY_REGISTERED`. |
| POST | `/api/auth/signin` | `{ email, password }` | `200 { user }`, plus a fresh session cookie. Invalid credentials: `401 INVALID_CREDENTIALS`. |
| GET | `/api/auth/me` | Session cookie | `200 { user }`; otherwise `401 AUTHENTICATION_REQUIRED`. |
| POST | `/api/auth/signout` | Session cookie; no body | `204` with cookie cleared; idempotent even if already signed out. |
| GET | `/api/me/bookings` | Session cookie | `200 { bookings: Booking[] }`, only owned bookings; otherwise `401`. |
| POST | `/api/bookings` | Session cookie, UUID `Idempotency-Key`, `{ spaceId, date, startTime, durationHours }` | Existing create/replay semantics, `201`/`200`; guest without a session: `401 AUTHENTICATION_REQUIRED`. |
| GET | `/api/bookings/:token` | Private token and owner session for account bookings | `200 { booking }`; `404 NOT_FOUND` for unknown/non-owned account bookings. Legacy guest token behavior is preserved. |
| POST | `/api/bookings/:token/cancel` | Private token and owner session for account bookings | Existing idempotent `200 { booking }` or `409 CANCELLATION_CLOSED`; non-owner: `404`. Legacy guest token behavior is preserved. |

`user` is `{ id, fullName, email, createdAt }`; IDs are UUIDs and timestamps are UTC ISO strings. Never send password hashes, session secrets or password-verification metadata in API responses. Booking representations keep the current fields (including customer name/email snapshots and private confirmation URL) only in authorized **private** endpoints, never in public space/availability responses.

**Auth validation details:** Invalid JSON and malformed fields return `400` with safe field errors. Sign-in credentials are validated without leaking whether the account exists; the same external error applies to unknown account and incorrect password. Missing/expired session errors are distinct from transient network/server failures. Validate return destinations against internal paths only; never redirect to an arbitrary user-supplied host.

## Session security and authorization

- Use **real server-managed sessions** persisted in SQLite, not frontend-only login, localStorage bearer tokens or a hard-coded demo user. Generate at least 256 random bits per session; place the opaque session identifier only in an **HttpOnly** cookie; store only a cryptographic hash of the session token in the DB.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` when served over HTTPS in production. Allow local HTTP development. Rotate session token on sign-in/sign-up, prevent session fixation, and expire sessions after **7 days** unless signed in again. Sign-out revokes its server-side session and expires the cookie.
- Hash passwords with a maintained password KDF using unique per-user salts (Node's `scrypt` is suitable and avoids native OS binary dependencies on macOS Big Sur). Never use plaintext, reversible encryption or unsalted SHA-256 for passwords. Use constant-time verification where applicable.
- Enforce exact configured-origin checks on state-changing requests in test and production as CSRF defense in addition to `SameSite`. Development additionally permits `localhost`, `127.0.0.1`, and `[::1]` aliases only when both origins are loopback addresses with the same protocol and port. Reject missing, malformed, external, or mismatched origins with `403 INVALID_ORIGIN`; do not enable permissive cross-origin credentialed CORS. The existing Vite same-origin `/api` proxy remains appropriate. `APP_ORIGIN` continues to determine generated private links.
- Add bounded, deterministic sign-in and sign-up rate limiting, including an explicit `429 RATE_LIMITED` response. Do not log passwords, session cookies, private booking tokens, customer data or submission identifiers.
- Never trust an account/user ID, name or email supplied in the booking payload as authority. Read the authenticated user from the session server-side. Ownership must be enforced for list, detail, cancellation and idempotent replay. Return `404` rather than revealing another user's booking.
- A user signing out or changing account while a booking's outcome is uncertain must not permit that pending request to be replayed as a different account. Preserve the original idempotency key and exact payload; require the original account session to resolve it.

## Database migration and backward compatibility

Use an **additive migration** after `001_initial.sql`, preserving existing spaces, reservations and submission-key rows. Do not reset/reseed user data or delete bookings during migration.

- Add `users` (UUID id, full name, canonical case-insensitive unique email, salted password hash/KDF metadata, created timestamp) and `sessions` (hashed opaque token, user FK, expiry/creation timestamps) with foreign-key enforcement and appropriate indexes.
- Add nullable `user_id` to `bookings` with `REFERENCES users(id) ON DELETE RESTRICT`. Existing rows remain **legacy guest bookings** with `NULL user_id`; new account bookings require a non-null owner at creation.
- Snapshot the authenticated name/email into each new booking's existing columns. Preserve existing booking reference, rate, space name, currency, token, created time, and status behavior.
- Keep `booking_submissions` durable and atomic with booking inserts. Its original request normalization remains valid for legacy records. An unchanged legacy submission replay with an already persisted key must still return the stored booking (without enabling **new** guest booking creation); new account-owned replay must require the matching authenticated owner. Never reinterpret another account's key as a new attempt.
- For authenticated bookings, normalize and store the input fields plus authenticated user ID as part of the idempotency identity. Check an eligible successful replay **before** rechecking time or availability. Identical concurrent submissions with one key create one booking and replay the same result; changed data returns `409 IDEMPOTENCY_KEY_REUSED` only for the matching owner. A key belonging to another account must reveal no booking data.
- Continue SQLite `BEGIN IMMEDIATE` protection for booking creation, overlap checks, idempotency, and booking/space deletion integrity; sessions and account deletes must not bypass foreign keys.

## Test-environment support

Existing test-support space/booking operations remain available **only** in explicit `APP_ENV=test` with an isolated database. New public accounts can be created through the **normal signup endpoint** in that environment—do not add a fake login or bypass authentication.

Add `DELETE /api/test-support/users/:userId` only in that isolated mode for cleanup: return `204` when the user is absent or successfully deleted, invalidate/delete that user's sessions, and reject deletion with `409 USER_HAS_BOOKINGS` if **any** booking (including cancelled) references the user. Tests must first use the existing test-only booking deletion endpoint for dependent bookings. Never cascade-delete unrelated bookings. Outside test mode, this endpoint (like all `/api/test-support/*`) returns `404` without side effects. No new automation fixtures, page objects, Playwright configuration, reports or CI in the application branch.

## Error, retry and accessibility requirements

- All client API requests time out after 10 seconds. Read failures show Retry without losing browse filters or date/slot selection. Authentication submission errors leave entered values available for correction in the current form; mode switches clear passwords and confirmation, and the application does not persist authentication field values across reloads.
- A `401` on an authenticated read/action produces a clear session-expired/sign-in-required state. A `500` or network error is a genuine unknown outcome, not automatically interpreted as sign-out or rejected credentials.
- Do not reset the booking attempt after a timeout/connection loss/500. As in release 1, persist the unchanged booking payload and UUID submission key in sessionStorage and retry the same operation, tied to the same user. Recheck availability after a definite conflict. Do not generate a second key for an uncertain attempt.
- Login/signup inputs have accessible labels, field-associated errors, visible keyboard focus, and password-visibility buttons with accessible names. Error messages are announced to assistive technology; submit controls visibly indicate pending requests.
- Account menu and Cancel confirmation dialog must support keyboard operation and focus management. Present readable empty, loading, error and recovery states on mobile and desktop.

## Acceptance and verification (implementation phase)

1. Guest browsing/filtering/details/availability work unchanged. Guest cannot create a booking via UI or HTTP, and guest selection is preserved across sign-in/signup without auto-booking.
2. Signup checks the six-character minimum and 128-character maximum, exact empty/mismatched confirmation messages, valid matching confirmation, and duplicate case-insensitive email handling. Signin handles valid, invalid and rate-limited attempts. Successful signout returns home with history replacement; a failed signout retains the current page; direct guest access to My Bookings still offers sign-in. Signout and expiry block private account reads.
3. Current-user and My Bookings APIs return only the authenticated account's data; two accounts cannot read/cancel one another's bookings or replay one another's idempotency keys.
4. Account-based booking keeps existing timezone, concurrency, pricing, adjacent/overlap, cancellation, and retry guarantees. The booking's name/email come from the account, irrespective of any client attempt to override them.
5. Existing guest bookings and private tokens remain functional after migrations; old submissions and data are not lost. Existing guest bookings are not automatically claimed by matching email.
6. Test-only user cleanup is isolated, idempotent, and cannot remove a user with booking references; normal modes return `404` on all test-support routes.
7. Verify direct guest Account access, mode-switch state, safe return destinations and restored booking selections, menu closure for mouse/keyboard and same-page selection, inline errors, compact desktop/mobile layouts, stable scroll during refresh, loading/empty/error/retry, 10-second timeout, account switch, refresh persistence, and uncertain booking retries.
8. Run typecheck, configured lint if any, production build, and focused backend HTTP/SQLite checks before acceptance. Record actual results; manually verify representative UI journeys. Future Playwright automation framework remains out of scope.

**Verification status (2026-11-01):** Local typecheck, production build, all six backend tests, and representative desktop/mobile browser flows have passed. Confirmation-message behavior was also checked after its final update. See the [README verification record](../README.md#v11-verification-record-2026-11-01) for tested screens, delayed-read checks, and the distinction between real temporary-database flows and mocked authentication responses. This record does not claim exhaustive release acceptance or production deployment.
