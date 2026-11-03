import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { Booking } from '../../shared/contracts.js';
import { CURRENCY, TIMEZONE } from '../../shared/contracts.js';
import { SpaceApi } from '../api/SpaceApi.js';
import { AccountPage } from '../pages/AccountPage.js';
import type { TestAccount } from '../support/TestDataManager.js';

type BookingGroup = 'Upcoming' | 'Cancelled';
type BookingGroupCounts = Record<BookingGroup, number>;

export class MyBookingsFlow {
  constructor(private readonly page: Page) {}

  async openMyBookings(): Promise<void> {
    await test.step('Open My Bookings', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/spaces');
      await expect(accountPage.accountMenu, 'A signed-in customer should have an account menu.')
        .toBeVisible();
      await accountPage.openMyBookings();
      await expect(this.page).toHaveURL(/\/my-bookings$/);
      await expect(accountPage.myBookingsHeading).toBeVisible();
    });
  }

  async verifyEmptyBookings(): Promise<void> {
    await test.step('Verify the customer has no bookings', async () => {
      const accountPage = new AccountPage(this.page);
      await expect(accountPage.noBookingsHeading).toBeVisible();
      await expect(
        accountPage.browseSpacesLink,
        'The empty state should offer a way to browse spaces.'
      ).toBeVisible();
    });
  }

  async verifyGroupCounts(counts: BookingGroupCounts): Promise<void> {
    await test.step('Verify booking group counts', async () => {
      const accountPage = new AccountPage(this.page);
      await expect(accountPage.bookingGroupHeading('Upcoming', counts.Upcoming)).toBeVisible();
      await expect(accountPage.bookingGroupHeading('Cancelled', counts.Cancelled)).toBeVisible();
    });
  }

  async verifyBookingInGroup(booking: Booking, group: BookingGroup): Promise<void> {
    await test.step(`Verify booking ${booking.reference} in ${group}`, async () => {
      const accountPage = new AccountPage(this.page);
      const row = accountPage.bookingRowInGroup(group, booking.reference);
      const start = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE);
      const end = DateTime.fromISO(booking.endsAt, { zone: 'utc' }).setZone(TIMEZONE);
      const expectedDateTime =
        `${start.toFormat('dd LLL yyyy · HH:mm')}–${end.toFormat('HH:mm')} · ${TIMEZONE}`;
      const expectedTotal = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: CURRENCY
      }).format(booking.totalPrice / 100);
      const status = group === 'Upcoming' ? 'Confirmed' : 'Cancelled';

      await expect(row, `Booking ${booking.reference} should belong in the ${group} group.`)
        .toBeVisible();
      await expect(row.getByRole('heading', { level: 3 })).toHaveText(booking.spaceName);
      await expect(row).toContainText(booking.reference);
      await expect(row).toContainText(expectedDateTime);
      await expect(row).toContainText(expectedTotal);
      await expect(accountPage.bookingStatus(booking.reference, status)).toBeVisible();
    });
  }

  async verifyBookingNotListed(booking: Booking): Promise<void> {
    await test.step('Verify another customer’s booking is not listed', async () => {
      await expect(
        new AccountPage(this.page).bookingRow(booking.reference),
        'The other account’s booking must not be visible.'
      ).toHaveCount(0);
    });
  }

  async requestCancellation(booking: Booking): Promise<void> {
    await test.step(`Open the cancellation dialog for ${booking.reference}`, async () => {
      const accountPage = new AccountPage(this.page);
      await accountPage.cancelBookingButton(booking.reference).click();
      await expect(accountPage.cancellationDialog).toBeVisible();
    });
  }

  async keepBooking(): Promise<void> {
    await test.step('Dismiss the cancellation dialog', async () => {
      const accountPage = new AccountPage(this.page);
      await accountPage.keepBookingButton.click();
      await expect(accountPage.cancellationDialog).toBeHidden();
    });
  }

  async verifyBookingConfirmed(booking: Booking): Promise<void> {
    await this.verifyBookingInGroup(booking, 'Upcoming');
  }

  async confirmCancellation(): Promise<void> {
    await test.step('Confirm the booking cancellation', async () => {
      await new AccountPage(this.page).confirmCancellationButton.click();
    });
  }

  async verifyBookingCancelled(booking: Booking): Promise<void> {
    await this.verifyBookingInGroup(booking, 'Cancelled');
    await test.step('Verify the cancelled booking is no longer upcoming', async () => {
      await expect(
        new AccountPage(this.page).bookingRowInGroup('Upcoming', booking.reference)
      ).toHaveCount(0);
    });
  }

  async reloadPage(): Promise<void> {
    await test.step('Reload My Bookings', async () => {
      await this.page.reload();
    });
  }

  async verifyTimeSlotAvailable(booking: Booking, account: TestAccount): Promise<void> {
    await test.step('Verify the cancelled booking time is available again', async () => {
      const localStart = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE);
      const date = localStart.toISODate();
      if (!date) throw new Error('Could not determine the booking date in the configured timezone.');

      const availability = await new SpaceApi(account.request).getAvailability(
        booking.spaceId,
        date,
        booking.durationHours
      );
      expect(
        availability.slots.some(slot => slot.startTime === localStart.toFormat('HH:mm')),
        'The cancelled booking’s original slot should be available again.'
      ).toBe(true);
    });
  }
}
