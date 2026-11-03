# SpaceBook — application requirements

Status: final first-release application scope.
Requirements branch: `docs/application-requirements`. Implementation branch: `feat/demo-application`.

## Purpose and scope

A small creative-space booking application for photography studios, rehearsal rooms, and podcast booths. Customers browse and filter spaces, view details, reserve a time slot, view a booking through a private confirmation link, and cancel it.

Seed a few spaces. Use a small persistent database, one venue timezone shown in the UI, one currency (EUR), and fixed hourly rates. Exclude accounts, payments, maps, reviews, discounts, notifications, admin screens, and external integrations from the first version.

## Core rules and acceptance criteria

| ID | Rule and acceptance criterion |
|---|---|
| BR-01 | Filter spaces by type and minimum capacity; every result matches all selected filters. |
| BR-02 | Details show equipment, opening hours, hourly rate, and venue timezone. |
| BR-03 | Reservations start on whole hours, last one to four whole hours, and fit within opening hours. Invalid requests are rejected. |
| BR-04 | Reservations must start in the future according to the server clock. |
| BR-05 | Active reservations cannot overlap for the same space. Adjacent reservations are allowed. |
| BR-06 | Confirmation checks availability atomically: for an initially available slot, exactly one of two otherwise valid concurrent overlapping requests succeeds with `201`; the other returns `409`. Exactly one booking is stored. |
| BR-07 | The server calculates the total from the stored rate and duration; client-supplied totals cannot override it. |
| BR-08 | Customer name and a valid email are required. A successful booking shows its reference, space, date, time, total, status, and private confirmation link. |
| BR-09 | Cancelling a future booking releases its slot. Repeating cancellation succeeds without further state changes. |
| BR-10 | A private, unguessable confirmation token controls access to a booking. Unknown tokens reveal no customer data. |

## API response contract

| Status | Scenario |
|---|---|
| 200 | Read a resource or cancel a booking, including an already cancelled booking. |
| 201 | Create a booking successfully, or create a space through the test-only data management API. |
| 204 | Delete a booking or an empty space through the test-only data management API, including when the record is already absent. No response body. |
| 400 | Invalid input, including missing fields, invalid duration, past start time, or a time outside opening hours. |
| 404 | Referenced space or booking does not exist, or the confirmation token is unknown. |
| 409 | The requested booking conflicts with an active reservation, or a test-only space deletion is blocked by existing bookings. |
| 500 | Unexpected backend failure; return a generic error without stack traces or database details. |

Errors have a stable machine-readable code and a safe message. Validation errors may include field errors.

## Test-environment data management API

The application must provide the following API capabilities in a dedicated test environment. These are application capabilities; fixture design and other automation implementation details belong in a separate document. No admin screens are required.

| Operation | Endpoint | Required behavior |
|---|---|---|
| Create a space | `POST /api/test-support/spaces` | Accept space details and return `201` with the generated unique ID and persisted space details. Invalid input returns `400` with validation details and creates no record. |
| Permanently delete a booking | `DELETE /api/test-support/bookings/{bookingId}` | Delete the specified booking, whether confirmed or cancelled, and any associated submission-identifier record. Return `204` if deleted or already absent. Deletion releases any availability occupied by that booking. |
| Permanently delete an empty space | `DELETE /api/test-support/spaces/{spaceId}` | Return `204` if deleted or already absent. If any booking references the space, including cancelled bookings, return `409` with code `SPACE_HAS_BOOKINGS` and leave all records unchanged. |

### Space creation contract

The creation request contains `name`, `type`, `capacity`, `equipment`, `hourlyRate`, and `openingHours`. The venue timezone (`Europe/Warsaw`) and EUR currency are inherited from application configuration.

- `name` is a non-empty string after trimming whitespace.
- `type` is one of `photography-studio`, `rehearsal-room`, or `podcast-booth`.
- `capacity` is a positive integer.
- `equipment` is an array of non-empty strings; an empty array is allowed.
- `hourlyRate` is a positive integer expressed in euro cents.
- `openingHours` maps weekday numbers `1` (Monday) through `7` (Sunday) to either `null` for a closed day or an object containing `opensAt` and `closesAt` in 24-hour `HH:00` format. All seven days are required. Opening time must precede closing time on the same day.

The response contains these normalized fields plus the server-generated `id`. Space names need not be unique; records are identified by ID.

### Availability, deletion, and environment boundaries

- Newly created spaces must immediately be accessible through normal space listing, filtering, details, availability, and booking operations, subject to the same business rules as seeded spaces.
- Create bookings through the normal booking API and return their IDs in successful creation responses. A separate booking-creation bypass is not required.
- Delete dependent bookings before deleting their space. Cancellation alone does not permanently delete a booking and therefore does not permit space deletion.
- Deletion affects only the addressed record and its explicitly associated submission-identifier record; it must not reset the database or delete unrelated spaces or bookings.
- Space deletion and booking creation must preserve referential integrity under concurrent requests: a booking must never reference a deleted space.
- Outside the dedicated test environment, all `/api/test-support/*` routes must be unavailable and return `404` without mutating data.
- Permanently deleted records must no longer appear through normal reads. Existing private links to deleted bookings return `404`.

## UI error handling

| ID | Condition | Required UI behavior and acceptance criteria |
|---|---|---|
| UI-ERR-01 | Invalid form input | Show specific inline errors next to affected fields; associate messages with inputs and move focus to the first invalid field after submission. Preserve other values. Correcting the input allows submission. |
| UI-ERR-02 | API rejects input with 400 | Display returned field errors where available, otherwise an actionable form-level message. Preserve customer details and slot selection so the customer can correct them. |
| UI-ERR-03 | Space or booking returns 404 | Show a clear unavailable/not-found state with a link back to spaces. Do not leave an endless spinner or render broken details. Reveal no customer data for unknown booking links. |
| UI-ERR-04 | Slot conflict returns 409 | Explain that the slot is no longer available, refresh availability, and ask the customer to choose another slot. Preserve customer details. Do not show a success confirmation. |
| UI-ERR-05 | Reading spaces, details, or availability fails with 500 or a network error | Show an error distinct from an empty result, end the loading state, and provide Retry. Retry repeats only the failed read, preserves relevant filters/selections, and replaces the error with content after recovery. |
| UI-ERR-06 | Booking submission fails with 500, connection loss, or timeout | End the loading state and preserve the form. Explain that confirmation could not be verified; do not claim success or definite failure without evidence. Any retry must reuse the original submission identifier so it cannot create a duplicate booking. |
| UI-ERR-07 | Cancellation fails | Do not display a successful cancellation or release the slot locally without server confirmation. Keep the last confirmed status visible, explain that cancellation could not be confirmed, and allow an idempotent retry or status refresh. |
| UI-ERR-08 | A request is pending | Show a visible loading state and prevent repeated submission of the same operation. Restore controls after completion or failure. All browser API requests time out after 10 seconds. A submission timeout follows UI-ERR-06; it does not prove that the server failed to save the booking. |
| UI-ERR-09 | Search returns no matches or no slots are available | Show a helpful empty state with an appropriate next step, such as changing filters or date. Do not label a valid empty response as a server error. |
| UI-ERR-10 | Any user-facing error | Use plain language, expose no internal stack traces, and communicate errors through text rather than color alone. Announce asynchronous errors to assistive technology. |

### Safe booking retries

Generate one submission identifier per booking attempt and reuse it for retries of that unchanged attempt. The backend stores the identifier with the booking atomically. Repeating the same request returns the existing booking; reusing the identifier with different booking details is rejected. Keep the identifier while the outcome remains uncertain. This is required to cover response loss after a booking has already been saved.


## Screens and navigation

| Screen | Route | Required content and behavior |
|---|---|---|
| Browse spaces | `/spaces` | Space cards with name, image, type, capacity, and hourly rate. Optional type and minimum-capacity filters combine using AND; clearing them restores all spaces. Each card links to its details. `/` redirects here. |
| Space details and booking | `/spaces/{spaceId}` | Photo, equipment, opening hours, rate, date, duration, available start times, selected time range, customer name/email, server-priced total, and Confirm booking. Successful submission navigates to the booking's private URL. |
| Booking details / confirmation | `/bookings/{token}` | Reference, space name, date, start/end, timezone, duration, rate, total, and status. A future confirmed booking offers cancellation through a confirmation dialog. Success updates this screen to Cancelled. A control copies the private URL; reopening that URL restores the booking. |
| Not found | Unknown UI routes or missing resources | A helpful unavailable/not-found message and link to `/spaces`. |

Use the approved SpaceBook mockup as visual direction: ivory background, dark typography, green primary actions, space imagery, and a two-column desktop details screen. On narrow screens, stack details above the booking form. Inputs have persistent labels; all controls support keyboard use and visible focus. Disabled time options are visibly distinct. Error and loading states remain within the relevant screen. Do not add accounts or payment steps.

## Detailed booking and validation rules

- All venue dates, opening hours, and displayed booking times use `Europe/Warsaw`, independent of the customer's browser timezone. Persist booking instants in UTC; responses also identify the venue timezone.
- Reservations must start strictly after the server's current time, start on a whole venue hour, and last 1, 2, 3, or 4 elapsed hours. The interval must remain within one venue calendar date and that day's opening hours. Ending exactly at closing time is allowed.
- Use weekly opening hours as defined in the space creation contract. No holidays, overnight opening, or date-specific schedules in this release. A closed day has no available slots.
- Omit ambiguous or nonexistent local start/end times during daylight-saving transitions; API requests selecting those local times return `400` with `INVALID_LOCAL_TIME`. A slot's elapsed duration must also equal the difference between its displayed local start/end hours, avoiding misleading ranges across clock changes.
- Slot overlap uses half-open intervals: an existing booking ending at 12:00 permits another starting at 12:00. Only confirmed bookings block availability.
- Availability is calculated for the selected date and duration. Offer every whole-hour start satisfying the rules; occupied whole-hour options may be shown disabled. Refresh after date/duration changes, after a conflict, and after a successful cancellation. Clear any selection that becomes invalid.
- A booking date is required and must be a valid `YYYY-MM-DD` date; start time is required in `HH:00` format. No advance-booking horizon in this release.
- Trim customer names; allow 1–100 characters. Trim email addresses; allow up to 254 characters, with non-whitespace text before and after one `@` and a dot in the domain. Use the same validation rule in client and server; ownership verification is excluded.
- Minimum capacity is optional and must be a positive integer. An unknown type or invalid capacity query returns `400`. Spaces are sorted by name then ID for stable ordering.
- Space names allow 1–100 trimmed characters. Equipment items allow 1–100 trimmed characters. Every numeric input must be a finite integer where required. Invalid JSON, malformed IDs, missing required fields, and unknown request fields return `400`; well-formed missing IDs return `404` on normal resource reads.
- Rates and totals use integer euro cents in the API and database, formatted as EUR in the UI. Booking total equals the stored rate multiplied by duration. Store the booking's rate and space name as snapshots so confirmation details remain stable.
- States are `confirmed` and `cancelled`. A past booking remains confirmed and displays a Past label; no automatic Completed state. Cancellation is allowed strictly before the start instant; at or after it return `409` with `CANCELLATION_CLOSED` and leave the booking unchanged. An already cancelled booking always returns `200` unchanged, even after its former start time.
- Rejected booking requests create no booking or occupied slot. Every successful booking has a generated UUID ID, a display reference, and a cryptographically random private token with at least 128 bits of entropy. Public space and availability responses contain no customer data, booking tokens, or submission identifiers.

## Normal API operations and representations

All bodies are JSON unless a `204` response is specified. IDs are UUIDs. Unknown tokens on private booking routes return `404`. The server is authoritative for validation, availability, and pricing.

| Method and endpoint | Input | Success response |
|---|---|---|
| `GET /api/spaces` | Optional query `type`, `minCapacity` | `200`, `{ spaces: Space[] }` |
| `GET /api/spaces/{spaceId}` | Space UUID | `200`, `{ space: Space }` |
| `GET /api/spaces/{spaceId}/availability` | Required query `date`, `durationHours` | `200`, `{ spaceId, date, durationHours, timezone, hourlyRate, totalPrice, slots }`; slots are `{ startTime, endTime }` objects for currently available options only. |
| `POST /api/bookings` | Header `Idempotency-Key`; body `{ spaceId, date, startTime, durationHours, customerName, customerEmail }` | First creation: `201`, `{ booking: Booking }`. Replay of a successful unchanged request: `200` with the same booking. |
| `GET /api/bookings/{token}` | Private token | `200`, `{ booking: Booking }` |
| `POST /api/bookings/{token}/cancel` | Private token; no body | `200`, `{ booking: Booking }` |

`Space` contains `id`, `name`, `type`, `capacity`, `equipment`, `hourlyRate`, `openingHours`, `timezone`, `currency`, and `imageUrl`. Test-support creation returns `{ space: Space }`; it uses a bundled default image selected by space type, requiring no external image upload.

`Booking` contains `id`, `reference`, `spaceId`, `spaceName`, `customerName`, `customerEmail`, `startsAt`, `endsAt`, `durationHours`, `hourlyRate`, `totalPrice`, `currency`, `timezone`, `status`, `createdAt`, `cancelledAt`, and `confirmationUrl`. Timestamps are ISO 8601 UTC strings; `cancelledAt` is null until cancellation. `confirmationUrl` points to `/bookings/{token}` on this application's origin. Do not include tokens in public space data.

Error bodies follow `{ error: { code, message, fieldErrors? } }`. `fieldErrors`, when present, maps request field names to readable messages. Use `VALIDATION_ERROR` for ordinary input errors, `INVALID_LOCAL_TIME` for unsupported local clock times, `NOT_FOUND` for missing resources, `BOOKING_CONFLICT` for overlap, `CANCELLATION_CLOSED` for late cancellation, `IDEMPOTENCY_KEY_REUSED` for changed replay data, `SPACE_HAS_BOOKINGS` for blocked deletion, and `INTERNAL_ERROR` for unexpected failures. A `500` has a generic safe message and no internal diagnostics.

### Submission identifier lifecycle

- `Idempotency-Key` is a client-generated UUID, required on booking creation. Store it atomically with the booking and normalized request, and retain it until test-support deletion permanently removes that booking.
- Reusing a key with identical normalized request data returns the existing booking with `200`, even if it has subsequently been cancelled. Reusing it with different data returns `409` and `IDEMPOTENCY_KEY_REUSED`. Concurrent identical submissions with one key produce one booking; one response is `201` and the replay response is `200`.
- Resolve successful replays before rechecking availability or whether the original start time is now in the past. Validation failures and slot conflicts do not consume a key.
- While a submission's outcome is uncertain, retain its key and unchanged payload in session storage across page reloads. Offer retry with that payload and key, and prevent editing until the outcome resolves. Failed initial submissions that could not be persisted may safely be retried with that same key.
- After a definite validation/conflict response, permit correction. Generate a new key when the customer starts a changed attempt after a definite outcome; never silently generate a new key for an uncertain retry.

## Initial data and operation

Provide at least three seeded spaces covering all three types, different capacities, and different rates. Use bundled images and no paid or external services. Start the application with no seeded bookings. Preserve bookings across normal server restarts. Provide documented install, configuration, database initialization, seed, start, and build commands. Seed operations must be repeatable without duplicating spaces or removing bookings. An explicitly documented local reset command may clear only the configured local database; it is never exposed as a normal application API.

Use an explicit application mode such as `APP_ENV=test` to enable test-support routes against a separately configured database. Default development and production modes keep them disabled, regardless of generic frontend build mode. Test mode is intended only for local or isolated CI use and must not be enabled on a publicly accessible deployment.

## Release acceptance

The four screens and their states follow these requirements; normal API operations enforce the same rules as the UI; reservations persist; conflicting bookings cannot both succeed; retries cannot create duplicate bookings; cancellation releases availability; and test-only data operations support independent resource creation and removal. Installation and startup instructions are reproducible. Automation architecture and test-suite implementation remain outside this document.
