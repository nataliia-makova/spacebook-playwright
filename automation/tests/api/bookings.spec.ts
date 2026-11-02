import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { ApiError, Booking, BookingInput } from '../../../shared/contracts.js';
import { TIMEZONE } from '../../../shared/contracts.js';
import { test, expect } from '../../fixtures/guest-fixtures.js';
import { APP_ORIGIN } from '../../support/testConfig.js';
import { futureBookingDate } from '../../data/factories.js';
import type { TestAccount } from '../../support/TestDataManager.js';

function outcomeForStatus<T extends { response: { status(): number } }>(
  outcomes: readonly T[],
  status: number
): T {
  const outcome = outcomes.find(item => item.response.status() === status);
  if (!outcome) throw new Error(`No booking response returned status ${status}.`);
  return outcome;
}

async function submitBooking(
  account: TestAccount,
  booking: BookingInput,
  idempotencyKey: string
) {
  return account.request.post('/api/bookings', {
    headers: {
      Origin: APP_ORIGIN,
      'Idempotency-Key': idempotencyKey
    },
    data: booking
  });
}

test('SpaceBook API and test-data setup are available', async ({ request, testDataManager }) => {
  await testDataManager.createAccount();
  const space = await testDataManager.createSpace();

  const response = await request.get('/api/spaces');

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.spaces).toBeInstanceOf(Array);
  expect(body.spaces).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: space.id })
  ]));
});

test('API-01: simultaneous bookings for the same slot return one conflict', async ({ testDataManager }) => {
  const firstAccount = await testDataManager.createAccount();
  const secondAccount = await testDataManager.createAccount();
  expect(firstAccount.user.id).not.toBe(secondAccount.user.id);
  const space = await testDataManager.createSpace();
  const booking: BookingInput = {
    spaceId: space.id,
    date: futureBookingDate(),
    startTime: '10:00',
    durationHours: 2
  };
  const firstIdempotencyKey = randomUUID();
  const secondIdempotencyKey = randomUUID();
  expect(firstIdempotencyKey).not.toBe(secondIdempotencyKey);

  const [firstResponse, secondResponse] = await Promise.all([
    submitBooking(firstAccount, booking, firstIdempotencyKey),
    submitBooking(secondAccount, booking, secondIdempotencyKey)
  ]);

  expect([firstResponse.status(), secondResponse.status()].filter(status => status === 201))
    .toHaveLength(1);
  expect([firstResponse.status(), secondResponse.status()].filter(status => status === 409))
    .toHaveLength(1);

  const [firstBookings, secondBookings] = await Promise.all([
    firstAccount.authApi.listBookings(),
    secondAccount.authApi.listBookings()
  ]);
  const outcomes = [
    { response: firstResponse, account: firstAccount, bookings: firstBookings },
    { response: secondResponse, account: secondAccount, bookings: secondBookings }
  ];
  const successful = outcomeForStatus(outcomes, 201);
  const conflict = outcomeForStatus(outcomes, 409);
  const successfulBody = await successful.response.json() as { booking: Booking };
  const conflictBody = await conflict.response.json() as ApiError;
  expect(conflictBody.error.code).toBe('BOOKING_CONFLICT');
  expect(DateTime.fromISO(successfulBody.booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
    .toBe(`${booking.date} 10:00`);
  expect(DateTime.fromISO(successfulBody.booking.endsAt, { zone: 'utc' }).setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
    .toBe(`${booking.date} 12:00`);

  const bookingsForSlot = [...firstBookings, ...secondBookings].filter(existing =>
    existing.spaceId === space.id &&
    existing.startsAt === successfulBody.booking.startsAt &&
    existing.endsAt === successfulBody.booking.endsAt
  );

  expect(bookingsForSlot).toHaveLength(1);
  expect(bookingsForSlot[0]).toMatchObject({
    id: successfulBody.booking.id,
    customerEmail: successful.account.user.email
  });
  expect(successful.bookings)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: successfulBody.booking.id })]));
  expect(conflict.bookings)
    .not.toEqual(expect.arrayContaining([expect.objectContaining({ spaceId: space.id })]));
});

test('API-02: adjacent bookings on the same date are both permitted', async ({ testDataManager }) => {
  const account = await testDataManager.createAccount();
  const space = await testDataManager.createSpace();
  const date = futureBookingDate();
  const firstBookingInput: BookingInput = {
    spaceId: space.id,
    date,
    startTime: '10:00',
    durationHours: 2
  };
  const secondBookingInput: BookingInput = {
    spaceId: space.id,
    date,
    startTime: '12:00',
    durationHours: 2
  };

  const firstResponse = await submitBooking(account, firstBookingInput, randomUUID());
  expect(firstResponse.status()).toBe(201);
  const firstBody = await firstResponse.json() as { booking: Booking };

  const secondResponse = await submitBooking(account, secondBookingInput, randomUUID());
  expect(secondResponse.status()).toBe(201);
  const secondBody = await secondResponse.json() as { booking: Booking };

  expect(secondBody.booking.id).not.toBe(firstBody.booking.id);
  expect(secondBody.booking.reference).not.toBe(firstBody.booking.reference);

  const persistedBookings = (await account.authApi.listBookings())
    .filter(booking => booking.spaceId === space.id)
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt));
  expect(persistedBookings).toHaveLength(2);
  expect(persistedBookings.map(booking => booking.id))
    .toEqual([firstBody.booking.id, secondBody.booking.id]);
  expect(persistedBookings.map(booking => booking.reference))
    .toEqual([firstBody.booking.reference, secondBody.booking.reference]);

  expect(DateTime.fromISO(firstBody.booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
    .toBe(`${date} 10:00`);
  expect(DateTime.fromISO(firstBody.booking.endsAt, { zone: 'utc' }).setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
    .toBe(`${date} 12:00`);
  expect(DateTime.fromISO(secondBody.booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
    .toBe(`${date} 12:00`);
  expect(DateTime.fromISO(secondBody.booking.endsAt, { zone: 'utc' }).setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
    .toBe(`${date} 14:00`);
  expect(DateTime.fromISO(firstBody.booking.endsAt, { zone: 'utc' }).toMillis())
    .toBeLessThanOrEqual(DateTime.fromISO(secondBody.booking.startsAt, { zone: 'utc' }).toMillis());
});

test('API-03: retrying an identical booking with the same key is idempotent', async ({ testDataManager }) => {
  const account = await testDataManager.createAccount();
  const space = await testDataManager.createSpace();
  const booking: BookingInput = {
    spaceId: space.id,
    date: futureBookingDate(),
    startTime: '10:00',
    durationHours: 2
  };
  const idempotencyKey = randomUUID();

  const firstResponse = await submitBooking(account, booking, idempotencyKey);
  expect(firstResponse.status()).toBe(201);
  const firstBody = await firstResponse.json() as { booking: Booking };

  const retryResponse = await submitBooking(account, booking, idempotencyKey);
  expect(retryResponse.status()).toBe(200);
  const retryBody = await retryResponse.json() as { booking: Booking };

  expect(retryBody.booking.id).toBe(firstBody.booking.id);
  expect(retryBody.booking.reference).toBe(firstBody.booking.reference);
  expect(retryBody.booking.confirmationUrl).toBe(firstBody.booking.confirmationUrl);

  const persistedBookings = (await account.authApi.listBookings())
    .filter(existing => existing.spaceId === space.id);
  expect(persistedBookings).toHaveLength(1);
  expect(persistedBookings[0]).toMatchObject({
    id: firstBody.booking.id,
    reference: firstBody.booking.reference,
    confirmationUrl: firstBody.booking.confirmationUrl
  });
});

test('API-04: reusing an idempotency key with a different payload is rejected', async ({ testDataManager }) => {
  const account = await testDataManager.createAccount();
  const space = await testDataManager.createSpace();
  const booking: BookingInput = {
    spaceId: space.id,
    date: futureBookingDate(),
    startTime: '10:00',
    durationHours: 2
  };
  const idempotencyKey = randomUUID();

  const firstResponse = await submitBooking(account, booking, idempotencyKey);
  expect(firstResponse.status()).toBe(201);
  const firstBody = await firstResponse.json() as { booking: Booking };

  const differentPayloadResponse = await submitBooking(
    account,
    { ...booking, startTime: '13:00' },
    idempotencyKey
  );
  expect(differentPayloadResponse.status()).toBe(409);
  const errorBody = await differentPayloadResponse.json() as ApiError;
  expect(errorBody.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

  const persistedBookings = (await account.authApi.listBookings())
    .filter(existing => existing.spaceId === space.id);
  expect(persistedBookings).toHaveLength(1);
  expect(persistedBookings[0]).toEqual(firstBody.booking);
});
