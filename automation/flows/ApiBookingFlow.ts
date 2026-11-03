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

type Scenario = SingleBookingScenario | TwoCustomerScenario;
type OriginalSubmission = { booking: Booking; idempotencyKey: string };
type ConcurrentSubmission = {
  firstResponse: APIResponse;
  secondResponse: APIResponse;
  firstKey: string;
  secondKey: string;
  winner?: { account: TestAccount; booking: Booking };
  losingAccount?: TestAccount;
};

export class ApiBookingFlow {
  // The fixture constructs a fresh flow for each test. No state is shared between tests.
  private original: OriginalSubmission | undefined;
  private adjacentBooking: Booking | undefined;
  private retryBooking: Booking | undefined;
  private keyReuseResponse: APIResponse | undefined;
  private concurrent: ConcurrentSubmission | undefined;

  constructor(
    private readonly guestRequest: APIRequestContext,
    private readonly origin: string
  ) {}

  async createBooking(scenario: Scenario): Promise<void> {
    await test.step('Create the original booking', async () => {
      if (this.original) throw new Error('The original booking has already been created.');
      const owner = this.owner(scenario);
      const idempotencyKey = randomUUID();
      const response = await new BookingApi(owner.request, this.origin)
        .submit(scenario.booking, idempotencyKey);
      expect(response.status()).toBe(201);
      const body = await response.json() as { booking: Booking };
      this.original = { booking: body.booking, idempotencyKey };
    });
  }

  async submitConcurrentBookings(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Submit two simultaneous bookings for the same slot', async () => {
      const firstKey = randomUUID();
      const secondKey = randomUUID();
      const [firstResponse, secondResponse] = await Promise.all([
        new BookingApi(scenario.firstCustomer.request, this.origin).submit(scenario.booking, firstKey),
        new BookingApi(scenario.secondCustomer.request, this.origin).submit(scenario.booking, secondKey)
      ]);
      this.concurrent = { firstResponse, secondResponse, firstKey, secondKey };
    });
  }

  async verifyOneBookingAccepted(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify exactly one concurrent booking was accepted', async () => {
      const result = this.requireConcurrent();
      expect(result.firstKey).not.toBe(result.secondKey);
      expect([result.firstResponse.status(), result.secondResponse.status()].sort())
        .toEqual([201, 409]);

      const firstWon = result.firstResponse.status() === 201;
      const accepted = firstWon ? result.firstResponse : result.secondResponse;
      const body = await accepted.json() as { booking: Booking };
      this.verifyLocalBookingTime(body.booking, scenario.booking);
      result.winner = {
        account: firstWon ? scenario.firstCustomer : scenario.secondCustomer,
        booking: body.booking
      };
      result.losingAccount = firstWon ? scenario.secondCustomer : scenario.firstCustomer;
    });
  }

  async verifyConflictingBookingRejected(): Promise<void> {
    await test.step('Verify the competing booking was rejected as a conflict', async () => {
      const result = this.requireConcurrent();
      const rejected = result.firstResponse.status() === 409
        ? result.firstResponse
        : result.secondResponse;
      await this.expectApiError(rejected, 409, 'BOOKING_CONFLICT');
    });
  }

  async verifyOnlyWinningCustomerHasBooking(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify the winning customer owns the only booking for the slot', async () => {
      const result = this.requireConcurrent();
      const winner = result.winner;
      const loser = result.losingAccount;
      if (!winner || !loser) {
        throw new Error('Verify the winning concurrent booking before checking persistence.');
      }
      const [winningBookings, losingBookings] = await Promise.all([
        winner.account.authApi.listBookings(),
        loser.authApi.listBookings()
      ]);
      const matchingBookings = [...winningBookings, ...losingBookings].filter(booking =>
        booking.spaceId === scenario.space.id &&
        booking.startsAt === winner.booking.startsAt &&
        booking.endsAt === winner.booking.endsAt
      );
      expect(matchingBookings).toHaveLength(1);
      expect(matchingBookings[0]).toMatchObject({
        id: winner.booking.id,
        customerEmail: winner.account.user.email,
        status: 'confirmed'
      });
      expect(winningBookings)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: winner.booking.id })]));
      expect(losingBookings.filter(booking => booking.spaceId === scenario.space.id))
        .toHaveLength(0);
    });
  }

  async createAdjacentBooking(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Book the adjacent time slot', async () => {
      this.requireOriginal();
      const adjacentInput = {
        ...scenario.booking,
        startTime: this.endTime(scenario.booking)
      };
      const response = await new BookingApi(scenario.customer.request, this.origin)
        .submit(adjacentInput, randomUUID());
      expect(response.status()).toBe(201);
      const body = await response.json() as { booking: Booking };
      this.adjacentBooking = body.booking;
    });
  }

  async verifyAdjacentBookingsPersisted(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Verify both adjacent bookings are distinct and persisted', async () => {
      const first = this.requireOriginal().booking;
      const second = this.adjacentBooking;
      if (!second) throw new Error('Create the adjacent booking before checking persistence.');

      expect(second.id).not.toBe(first.id);
      expect(second.reference).not.toBe(first.reference);
      const persisted = this.forSpace(
        await scenario.customer.authApi.listBookings(), scenario.space.id
      ).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      expect(persisted).toHaveLength(2);
      expect(persisted.map(booking => booking.id)).toEqual([first.id, second.id]);
      expect(persisted.map(booking => booking.reference))
        .toEqual([first.reference, second.reference]);

      this.verifyLocalBookingTime(first, scenario.booking);
      this.verifyLocalBookingTime(second, {
        ...scenario.booking,
        startTime: this.endTime(scenario.booking)
      });
      expect(DateTime.fromISO(first.endsAt, { zone: 'utc' }).toMillis())
        .toBeLessThanOrEqual(DateTime.fromISO(second.startsAt, { zone: 'utc' }).toMillis());
    });
  }

  async retryBookingWithSameKey(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Retry the same booking with the same idempotency key', async () => {
      const original = this.requireOriginal();
      const response = await new BookingApi(scenario.customer.request, this.origin)
        .submit(scenario.booking, original.idempotencyKey);
      expect(response.status()).toBe(200);
      const body = await response.json() as { booking: Booking };
      this.retryBooking = body.booking;
    });
  }

  async verifySameBookingReturned(): Promise<void> {
    await test.step('Verify the retry returned the original booking reference and URL', async () => {
      const original = this.requireOriginal().booking;
      const retry = this.retryBooking;
      if (!retry) throw new Error('Retry the booking before comparing responses.');
      expect(retry.id).toBe(original.id);
      expect(retry.reference).toBe(original.reference);
      expect(retry.confirmationUrl).toBe(original.confirmationUrl);
    });
  }

  async retryWithChangedPayload(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Retry with the original key but a different booking time', async () => {
      const original = this.requireOriginal();
      this.keyReuseResponse = await new BookingApi(scenario.customer.request, this.origin)
        .submit({ ...scenario.booking, startTime: '13:00' }, original.idempotencyKey);
    });
  }

  async verifyIdempotencyKeyReuseRejected(): Promise<void> {
    await test.step('Verify the changed booking was rejected as key reuse', async () => {
      if (!this.keyReuseResponse) {
        throw new Error('Submit the changed booking before checking key reuse.');
      }
      await this.expectApiError(this.keyReuseResponse, 409, 'IDEMPOTENCY_KEY_REUSED');
    });
  }

  async verifyOriginalBookingPersistedOnce(scenario: SingleBookingScenario): Promise<void> {
    await test.step('Verify the original booking remains the only persisted booking', async () => {
      const original = this.requireOriginal().booking;
      const persisted = this.forSpace(
        await scenario.customer.authApi.listBookings(), scenario.space.id
      );
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toEqual(original);
    });
  }

  async verifyOtherCustomerCannotRead(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify the second customer cannot read the private booking', async () => {
      const response = await this.otherCustomerApi(scenario)
        .getByConfirmation(this.requireOriginal().booking);
      await this.expectApiError(response, 404, 'NOT_FOUND');
    });
  }

  async verifyOtherCustomerCannotCancel(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify the second customer cannot cancel the booking', async () => {
      const response = await this.otherCustomerApi(scenario)
        .cancelRequest(this.requireOriginal().booking);
      await this.expectApiError(response, 404, 'NOT_FOUND');
    });
  }

  async verifyOtherCustomerCannotReplay(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify the second customer cannot replay the owner’s idempotency key', async () => {
      const response = await this.otherCustomerApi(scenario)
        .submit(scenario.booking, this.requireOriginal().idempotencyKey);
      await this.expectApiError(response, 404, 'NOT_FOUND');
    });
  }

  async verifyOwnerCanStillReadBooking(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify the owner can still read the unchanged confirmed booking', async () => {
      const original = this.requireOriginal().booking;
      const response = await new BookingApi(scenario.firstCustomer.request, this.origin)
        .getByConfirmation(original);
      expect(response.status()).toBe(200);
      const body = await response.json() as { booking: Booking };
      expect(body.booking).toEqual(original);
      expect(body.booking.status).toBe('confirmed');
    });
  }

  async verifyOnlyOwnerHasBooking(scenario: TwoCustomerScenario): Promise<void> {
    await test.step('Verify the unauthorized attempts created no extra bookings', async () => {
      const original = this.requireOriginal().booking;
      const [firstBookings, secondBookings] = await Promise.all([
        scenario.firstCustomer.authApi.listBookings(),
        scenario.secondCustomer.authApi.listBookings()
      ]);
      expect(this.forSpace(firstBookings, scenario.space.id)).toEqual([
        expect.objectContaining({
          id: original.id,
          reference: original.reference,
          status: 'confirmed'
        })
      ]);
      expect(this.forSpace(secondBookings, scenario.space.id)).toHaveLength(0);
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
      ).toBe(scenario.booking.date + ' ' + scenario.booking.startTime);
      expect(
        DateTime.fromISO(body.booking.endsAt, { zone: 'utc' })
          .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
      ).toBe(scenario.booking.date + ' 12:00');
    });
  }

  private owner(scenario: Scenario): TestAccount {
    return 'customer' in scenario ? scenario.customer : scenario.firstCustomer;
  }

  private otherCustomerApi(scenario: TwoCustomerScenario): BookingApi {
    return new BookingApi(scenario.secondCustomer.request, this.origin);
  }

  private requireOriginal(): OriginalSubmission {
    if (!this.original) throw new Error('Create the original booking before this step.');
    return this.original;
  }

  private requireConcurrent(): ConcurrentSubmission {
    if (!this.concurrent) throw new Error('Submit concurrent bookings before this step.');
    return this.concurrent;
  }

  private forSpace(bookings: Booking[], spaceId: string): Booking[] {
    return bookings.filter(booking => booking.spaceId === spaceId);
  }

  private endTime(input: BookingInput): string {
    return DateTime.fromISO(input.date + 'T' + input.startTime, { zone: TIMEZONE })
      .plus({ hours: input.durationHours }).toFormat('HH:mm');
  }

  private verifyLocalBookingTime(booking: Booking, input: BookingInput): void {
    expect(DateTime.fromISO(booking.startsAt, { zone: 'utc' })
      .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
      .toBe(input.date + ' ' + input.startTime);
    expect(DateTime.fromISO(booking.endsAt, { zone: 'utc' })
      .setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm'))
      .toBe(input.date + ' ' + this.endTime(input));
  }

  private async expectApiError(
    response: APIResponse, status: number, code: ApiError['error']['code']
  ): Promise<void> {
    expect(response.status()).toBe(status);
    const body = await response.json() as ApiError;
    expect(body.error.code).toBe(code);
  }
}
