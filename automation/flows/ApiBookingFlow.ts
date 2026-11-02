import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { ApiError, Booking, BookingInput, Space } from '../../shared/contracts.js';
import { TIMEZONE } from '../../shared/contracts.js';
import { BookingApi } from '../api/BookingApi.js';
import type { TestAccount } from '../support/TestDataManager.js';

export type SingleBookingScenario = {
  customer: TestAccount;
  space: Space;
  booking: BookingInput;
};

export type TwoCustomerScenario = {
  firstCustomer: TestAccount;
  secondCustomer: TestAccount;
  space: Space;
  booking: BookingInput;
};

type BookingResponseOutcome = {
  response: APIResponse;
  account: TestAccount;
  bookings: Booking[];
};

export class ApiBookingFlow {
  constructor(
    private readonly guestRequest: APIRequestContext,
    private readonly origin: string
  ) {}

  async verifyConcurrentBookingConflict(scenario: TwoCustomerScenario): Promise<void> {
    const firstBookingApi = new BookingApi(scenario.firstCustomer.request, this.origin);
    const secondBookingApi = new BookingApi(scenario.secondCustomer.request, this.origin);
    const idempotencyKeys = [randomUUID(), randomUUID()];
    const responses = await test.step('Submit simultaneous requests for the same slot', async () =>
      Promise.all([
        firstBookingApi.submit(scenario.booking, idempotencyKeys[0]!),
        secondBookingApi.submit(scenario.booking, idempotencyKeys[1]!)
      ])
    );

    const result = await test.step('Verify one request succeeds and the other conflicts', async () => {
      expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
      expect(responses.map(response => response.status()).sort())
        .toEqual([201, 409]);

      const outcomes = [
        {
          response: responses[0]!,
          account: scenario.firstCustomer,
          bookings: await scenario.firstCustomer.authApi.listBookings()
        },
        {
          response: responses[1]!,
          account: scenario.secondCustomer,
          bookings: await scenario.secondCustomer.authApi.listBookings()
        }
      ];
      const successful = this.outcomeForStatus(outcomes, 201);
      const conflict = this.outcomeForStatus(outcomes, 409);
      const successfulBody = await successful.response.json() as { booking: Booking };
      const conflictBody = await conflict.response.json() as ApiError;

      expect(conflictBody.error.code).toBe('BOOKING_CONFLICT');
      expect(
        DateTime.fromISO(successfulBody.booking.startsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} ${scenario.booking.startTime}`);
      expect(
        DateTime.fromISO(successfulBody.booking.endsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} 12:00`);

      return { successful, conflict, booking: successfulBody.booking };
    });

    await test.step('Verify the successful customer owns the only booking for the slot', async () => {
      const bookingsForSlot = [
        ...result.successful.bookings,
        ...result.conflict.bookings
      ].filter(booking =>
        booking.spaceId === scenario.space.id &&
        booking.startsAt === result.booking.startsAt &&
        booking.endsAt === result.booking.endsAt
      );

      expect(bookingsForSlot).toHaveLength(1);
      expect(bookingsForSlot[0]).toMatchObject({
        id: result.booking.id,
        customerEmail: result.successful.account.user.email,
        status: 'confirmed'
      });
      expect(result.successful.bookings)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: result.booking.id })]));
      expect(result.conflict.bookings.filter(booking => booking.spaceId === scenario.space.id))
        .toHaveLength(0);
    });
  }

  async verifyAdjacentBookings(scenario: SingleBookingScenario): Promise<void> {
    const bookingApi = new BookingApi(scenario.customer.request, this.origin);
    const firstInput = { ...scenario.booking, startTime: '10:00' };
    const secondInput = { ...scenario.booking, startTime: '12:00' };

    const firstResponse = await test.step('Book the first two-hour slot', async () => {
      const response = await bookingApi.submit(firstInput, randomUUID());
      expect(response.status()).toBe(201);
      return response;
    });
    const firstBody = await firstResponse.json() as { booking: Booking };

    const secondResponse = await test.step('Book the adjacent two-hour slot', async () => {
      const response = await bookingApi.submit(secondInput, randomUUID());
      expect(response.status()).toBe(201);
      return response;
    });
    const secondBody = await secondResponse.json() as { booking: Booking };

    await test.step('Verify both distinct bookings are persisted at adjacent boundaries', async () => {
      expect(secondBody.booking.id).not.toBe(firstBody.booking.id);
      expect(secondBody.booking.reference).not.toBe(firstBody.booking.reference);

      const persistedBookings = (await scenario.customer.authApi.listBookings())
        .filter(booking => booking.spaceId === scenario.space.id)
        .sort((first, second) => first.startsAt.localeCompare(second.startsAt));
      expect(persistedBookings).toHaveLength(2);
      expect(persistedBookings.map(booking => booking.id))
        .toEqual([firstBody.booking.id, secondBody.booking.id]);
      expect(persistedBookings.map(booking => booking.reference))
        .toEqual([firstBody.booking.reference, secondBody.booking.reference]);

      expect(
        DateTime.fromISO(firstBody.booking.startsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} 10:00`);
      expect(
        DateTime.fromISO(firstBody.booking.endsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} 12:00`);
      expect(
        DateTime.fromISO(secondBody.booking.startsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} 12:00`);
      expect(
        DateTime.fromISO(secondBody.booking.endsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} 14:00`);
      expect(DateTime.fromISO(firstBody.booking.endsAt, { zone: 'utc' }).toMillis())
        .toBeLessThanOrEqual(DateTime.fromISO(secondBody.booking.startsAt, { zone: 'utc' }).toMillis());
    });
  }

  async verifyIdempotentRetry(scenario: SingleBookingScenario): Promise<void> {
    const bookingApi = new BookingApi(scenario.customer.request, this.origin);
    const idempotencyKey = randomUUID();
    const firstResponse = await test.step('Submit the booking for the first time', async () => {
      const response = await bookingApi.submit(scenario.booking, idempotencyKey);
      expect(response.status()).toBe(201);
      return response;
    });
    const firstBody = await firstResponse.json() as { booking: Booking };

    const retryResponse = await test.step('Retry the identical booking with the same key', async () => {
      const response = await bookingApi.submit(scenario.booking, idempotencyKey);
      expect(response.status()).toBe(200);
      return response;
    });
    const retryBody = await retryResponse.json() as { booking: Booking };

    await test.step('Verify the retry returns the existing booking only once', async () => {
      expect(retryBody.booking.id).toBe(firstBody.booking.id);
      expect(retryBody.booking.reference).toBe(firstBody.booking.reference);
      expect(retryBody.booking.confirmationUrl).toBe(firstBody.booking.confirmationUrl);

      const persistedBookings = (await scenario.customer.authApi.listBookings())
        .filter(booking => booking.spaceId === scenario.space.id);
      expect(persistedBookings).toHaveLength(1);
      expect(persistedBookings[0]).toMatchObject({
        id: firstBody.booking.id,
        reference: firstBody.booking.reference,
        confirmationUrl: firstBody.booking.confirmationUrl
      });
    });
  }

  async verifyKeyReuseRejected(scenario: SingleBookingScenario): Promise<void> {
    const bookingApi = new BookingApi(scenario.customer.request, this.origin);
    const idempotencyKey = randomUUID();
    const originalResponse = await test.step('Create the original booking', async () => {
      const response = await bookingApi.submit(scenario.booking, idempotencyKey);
      expect(response.status()).toBe(201);
      return response;
    });
    const originalBody = await originalResponse.json() as { booking: Booking };

    await test.step('Reject a different booking payload with the same key', async () => {
      const response = await bookingApi.submit(
        { ...scenario.booking, startTime: '13:00' },
        idempotencyKey
      );
      expect(response.status()).toBe(409);
      const body = await response.json() as ApiError;
      expect(body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    await test.step('Verify the original booking is unchanged and remains unique', async () => {
      const persistedBookings = (await scenario.customer.authApi.listBookings())
        .filter(booking => booking.spaceId === scenario.space.id);
      expect(persistedBookings).toHaveLength(1);
      expect(persistedBookings[0]).toEqual(originalBody.booking);
    });
  }

  async verifyBookingOwnership(scenario: TwoCustomerScenario): Promise<void> {
    const bookingApi = new BookingApi(scenario.firstCustomer.request, this.origin);
    const idempotencyKey = randomUUID();
    const createResponse = await test.step('Create a booking for the first customer', async () => {
      const response = await bookingApi.submit(scenario.booking, idempotencyKey);
      expect(response.status()).toBe(201);
      return response;
    });
    const createBody = await createResponse.json() as { booking: Booking };

    await test.step('Deny the second customer access to the private booking', async () => {
      await test.step('Reject reading the booking', async () => {
        const response = await new BookingApi(scenario.secondCustomer.request, this.origin)
          .getByConfirmation(createBody.booking);
        expect(response.status()).toBe(404);
        const body = await response.json() as ApiError;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      await test.step('Reject cancelling the booking', async () => {
        const response = await new BookingApi(scenario.secondCustomer.request, this.origin)
          .cancelRequest(createBody.booking);
        expect(response.status()).toBe(404);
        const body = await response.json() as ApiError;
        expect(body.error.code).toBe('NOT_FOUND');
      });

      await test.step('Reject replaying the first customer’s idempotency key', async () => {
        const response = await new BookingApi(scenario.secondCustomer.request, this.origin)
          .submit(scenario.booking, idempotencyKey);
        expect(response.status()).toBe(404);
        const body = await response.json() as ApiError;
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    await test.step('Verify the first customer can still access the confirmed booking', async () => {
      const response = await bookingApi.getByConfirmation(createBody.booking);
      expect(response.status()).toBe(200);
      const body = await response.json() as { booking: Booking };
      expect(body.booking).toEqual(createBody.booking);
      expect(body.booking.status).toBe('confirmed');
    });

    await test.step('Verify no unauthorized booking was created', async () => {
      const [firstBookings, secondBookings] = await Promise.all([
        scenario.firstCustomer.authApi.listBookings(),
        scenario.secondCustomer.authApi.listBookings()
      ]);
      expect(firstBookings.filter(booking => booking.spaceId === scenario.space.id)).toEqual([
        expect.objectContaining({
          id: createBody.booking.id,
          reference: createBody.booking.reference,
          status: 'confirmed'
        })
      ]);
      expect(secondBookings.filter(booking => booking.spaceId === scenario.space.id))
        .toHaveLength(0);
    });
  }

  async verifyGuestBookingRejected(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Reject booking creation from an unauthenticated guest', async () => {
      const response = await new BookingApi(this.guestRequest, this.origin)
        .submit(scenario.booking, randomUUID());
      expect(response.status()).toBe(401);
      const body = await response.json() as ApiError;
      expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  }

  async verifyCustomerCanBookSameSlot(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Allow an authenticated customer to book the same slot', async () => {
      const response = await new BookingApi(scenario.customer.request, this.origin)
        .submit(scenario.booking, randomUUID());
      expect(response.status()).toBe(201);
      const body = await response.json() as { booking: Booking };

      const persistedBookings = (await scenario.customer.authApi.listBookings())
        .filter(booking => booking.spaceId === scenario.space.id);
      expect(persistedBookings).toHaveLength(1);
      expect(persistedBookings[0]).toMatchObject({
        id: body.booking.id,
        customerEmail: scenario.customer.user.email,
        startsAt: body.booking.startsAt,
        endsAt: body.booking.endsAt,
        status: 'confirmed'
      });
      expect(
        DateTime.fromISO(body.booking.startsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} ${scenario.booking.startTime}`);
      expect(
        DateTime.fromISO(body.booking.endsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(`${scenario.booking.date} 12:00`);
    });
  }

  private outcomeForStatus(
    outcomes: readonly BookingResponseOutcome[],
    status: number
  ): BookingResponseOutcome {
    const outcome = outcomes.find(item => item.response.status() === status);
    if (!outcome) throw new Error(`No booking response returned status ${status}.`);
    return outcome;
  }
}
