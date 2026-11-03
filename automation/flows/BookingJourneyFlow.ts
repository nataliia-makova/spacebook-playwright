import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { Booking, User } from '../../shared/contracts.js';
import type { BookingDatabaseRecord } from '../support/BookingDatabase.js';
import { AuthApi } from '../api/AuthApi.js';
import { readBookingsForSpace } from '../support/BookingDatabase.js';
import { APP_ORIGIN } from '../support/testConfig.js';
import type { BookingScenario } from './BookingFlow.js';

export type BookingJourneyState = {
  authenticatedCustomer?: User;
  confirmedBooking?: Booking;
  confirmedRecord?: BookingDatabaseRecord;
  cancelledBooking?: Booking;
};

export type BookingJourneyScenario = BookingScenario & {
  state: BookingJourneyState;
  readonly booking: Booking;
};

export class BookingJourneyFlow {
  private readonly authApi: AuthApi;

  constructor(page: Page) {
    this.authApi = new AuthApi(page.context().request, APP_ORIGIN);
  }

  async verifyAuthenticatedCustomer(scenario: BookingJourneyScenario): Promise<void> {
    await test.step('Verify signup authenticated the expected customer', async () => {
      const customer = await this.authApi.getCurrentUser();
      expect(customer).toMatchObject(scenario.customer);
      expect(customer.id).toBeTruthy();
      scenario.state.authenticatedCustomer = customer;
    });
  }

  async verifyConfirmedBookingInApi(scenario: BookingJourneyScenario): Promise<void> {
    await test.step('Verify the confirmed booking through the authenticated API', async () => {
      const bookings = await this.authApi.listBookings();
      expect(bookings).toHaveLength(1);
      const booking = bookings[0]!;
      expect(booking).toMatchObject({
        spaceId: scenario.space.id,
        spaceName: scenario.space.name,
        customerName: scenario.customer.fullName,
        customerEmail: scenario.customer.email,
        durationHours: scenario.durationHours,
        totalPrice: scenario.expectedTotalCents,
        status: 'confirmed',
        cancelledAt: null
      });
      const start = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(scenario.timezone);
      const end = DateTime.fromISO(booking.endsAt, { zone: 'utc' }).setZone(scenario.timezone);
      expect(start.toFormat('yyyy-MM-dd HH:mm'))
        .toBe(scenario.date + ' ' + scenario.startTime);
      expect(end.toMillis() - start.toMillis()).toBe(scenario.durationHours * 60 * 60 * 1000);
      scenario.state.confirmedBooking = booking;
    });
  }

  async verifyConfirmedBookingInDatabase(scenario: BookingJourneyScenario): Promise<void> {
    await test.step('Verify the confirmed booking in SQLite', async () => {
      const customer = scenario.state.authenticatedCustomer;
      if (!customer) throw new Error('Verify the authenticated customer before checking SQLite.');

      const booking = scenario.booking;
      const rows = readBookingsForSpace(scenario.space.id);
      expect(rows).toHaveLength(1);
      const record = rows[0]!;
      expect(record).toMatchObject({
        id: booking.id,
        reference: booking.reference,
        spaceId: scenario.space.id,
        userId: customer.id,
        customerName: scenario.customer.fullName,
        customerEmail: scenario.customer.email,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        durationHours: scenario.durationHours,
        totalPrice: scenario.expectedTotalCents,
        status: 'confirmed',
        cancelledAt: null
      });
      scenario.state.confirmedRecord = record;
    });
  }

  async verifyCancelledBookingInApi(scenario: BookingJourneyScenario): Promise<void> {
    await test.step('Verify the original booking was cancelled in the authenticated API', async () => {
      const bookings = await this.authApi.listBookings();
      expect(bookings).toHaveLength(1);
      const booking = bookings[0]!;
      expect(booking).toEqual({
        ...scenario.booking,
        status: 'cancelled',
        cancelledAt: expect.any(String)
      });
      expect(Number.isNaN(Date.parse(booking.cancelledAt ?? ''))).toBe(false);
      scenario.state.cancelledBooking = booking;
    });
  }

  async verifyCancelledBookingInDatabase(scenario: BookingJourneyScenario): Promise<void> {
    await test.step('Verify the cancelled booking was retained correctly in SQLite', async () => {
      const originalRecord = scenario.state.confirmedRecord;
      const cancelledBooking = scenario.state.cancelledBooking;
      if (!originalRecord || !cancelledBooking) {
        throw new Error('Verify the confirmed database record and API cancellation first.');
      }
      const rows = readBookingsForSpace(scenario.space.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        ...originalRecord,
        status: 'cancelled',
        cancelledAt: cancelledBooking.cancelledAt
      });
    });
  }
}
