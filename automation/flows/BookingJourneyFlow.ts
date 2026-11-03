import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { Booking, User } from '../../shared/contracts.js';
import type { SignupInput } from '../data/factories.js';
import { SpaceApi } from '../api/SpaceApi.js';
import { AccountPage } from '../pages/AccountPage.js';
import { BookingDetailsPage } from '../pages/BookingDetailsPage.js';
import { readBookingsForSpace } from '../support/BookingDatabase.js';
import { APP_ORIGIN } from '../support/testConfig.js';
import { BookingFlow, type BookingScenario } from './BookingFlow.js';
import { MyBookingsFlow } from './MyBookingsFlow.js';

export type BookingJourneyScenario = Omit<BookingScenario, 'customer'>;

export class BookingJourneyFlow {
  constructor(
    private readonly page: Page,
    private readonly bookingFlow: BookingFlow,
    private readonly myBookingsFlow: MyBookingsFlow
  ) {}

  async verifyBookingLifecycle(
    scenario: BookingJourneyScenario,
    credentials: SignupInput
  ): Promise<void> {
    const customer = await test.step('Verify browser signup created the authenticated customer', async () => {
      const response = await this.page.context().request.get(APP_ORIGIN + '/api/auth/me');
      expect(response.status()).toBe(200);
      const body = await response.json() as { user: User };
      expect(body.user).toMatchObject({
        fullName: credentials.fullName,
        email: credentials.email
      });
      expect(body.user.id).toBeTruthy();
      return body.user;
    });
    const bookingScenario: BookingScenario = { ...scenario, customer };

    await test.step('Create and confirm the booking through the UI', async () => {
      await this.bookingFlow.openSpace(bookingScenario);
      await this.bookingFlow.selectAvailableSlot(bookingScenario);
      await this.bookingFlow.verifyBookingPrice(bookingScenario);
      await this.bookingFlow.confirmBooking(bookingScenario);
    });

    const created = await test.step('Verify the confirmed booking in the UI, API and SQLite', async () => {
      const bookings = await this.readCustomerBookings();
      expect(bookings).toHaveLength(1);
      const booking = bookings[0]!;
      expect(booking).toMatchObject({
        spaceId: scenario.space.id,
        spaceName: scenario.space.name,
        customerName: credentials.fullName,
        customerEmail: credentials.email,
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
      await this.bookingFlow.verifyRecoveredBookingDetails(bookingScenario, booking);

      const rows = readBookingsForSpace(scenario.space.id);
      expect(rows).toHaveLength(1);
      const record = rows[0]!;
      expect(record).toMatchObject({
        id: booking.id,
        reference: booking.reference,
        spaceId: scenario.space.id,
        userId: customer.id,
        customerName: credentials.fullName,
        customerEmail: credentials.email,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        durationHours: scenario.durationHours,
        totalPrice: scenario.expectedTotalCents,
        status: 'confirmed',
        cancelledAt: null
      });

      await this.myBookingsFlow.openMyBookings();
      await this.myBookingsFlow.verifyBookingConfirmed(booking);
      await this.myBookingsFlow.verifyGroupCounts({ Upcoming: 1, Cancelled: 0 });
      return { booking, record };
    });

    await test.step('Cancel the original booking through My Bookings', async () => {
      await this.myBookingsFlow.requestCancellation(created.booking);
      await this.myBookingsFlow.confirmCancellation();
      await this.myBookingsFlow.verifyBookingCancelled(created.booking);
    });

    await test.step('Verify cancellation in the UI, API and SQLite and release the slot', async () => {
      const bookings = await this.readCustomerBookings();
      expect(bookings).toHaveLength(1);
      const booking = bookings[0]!;
      expect(booking).toEqual({
        ...created.booking,
        status: 'cancelled',
        cancelledAt: expect.any(String)
      });
      expect(Number.isNaN(Date.parse(booking.cancelledAt ?? ''))).toBe(false);

      await this.myBookingsFlow.verifyBookingCancelled(booking);
      await this.myBookingsFlow.verifyGroupCounts({ Upcoming: 0, Cancelled: 1 });
      await this.myBookingsFlow.reloadPage();
      await this.myBookingsFlow.verifyBookingCancelled(booking);
      await this.myBookingsFlow.verifyGroupCounts({ Upcoming: 0, Cancelled: 1 });

      const rows = readBookingsForSpace(scenario.space.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        ...created.record,
        status: 'cancelled',
        cancelledAt: booking.cancelledAt
      });

      const availability = await new SpaceApi(this.page.context().request).getAvailability(
        scenario.space.id, scenario.date, scenario.durationHours
      );
      expect(availability.slots.some(slot => slot.startTime === scenario.startTime))
        .toBe(true);

      await new AccountPage(this.page).bookingDetailsLink(booking.reference).click();
      const details = new BookingDetailsPage(this.page);
      await expect(details.heading).toHaveText('Booking cancelled');
      await expect(details.reference).toHaveText(created.booking.reference);
      await expect(details.customerName).toHaveText(credentials.fullName);
      await expect(details.customerEmail).toHaveText(credentials.email);
      await expect(details.status).toHaveText('Cancelled');
    });
  }

  private async readCustomerBookings(): Promise<Booking[]> {
    const response = await this.page.context().request.get(APP_ORIGIN + '/api/me/bookings');
    expect(response.status()).toBe(200);
    const body = await response.json() as { bookings: Booking[] };
    expect(Array.isArray(body.bookings)).toBe(true);
    return body.bookings;
  }
}
