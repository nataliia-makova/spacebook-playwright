import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { Booking, Space, User } from '../../shared/contracts.js';
import { CURRENCY, TIMEZONE } from '../../shared/contracts.js';
import { BookingDetailsPage } from '../pages/BookingDetailsPage.js';
import { SpaceDetailsPage } from '../pages/SpaceDetailsPage.js';

export type BookingScenario = {
  customer: User;
  space: Space;
  date: string;
  startTime: string;
  durationHours: number;
  expectedTotalCents: number;
  timezone: typeof TIMEZONE;
};

type BookingConfirmation = {
  reference: string;
  url: string;
};

function formatTotal(cents: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export class BookingFlow {
  private confirmation: BookingConfirmation | undefined;

  constructor(private readonly page: Page) {}

  async openSpace(scenario: BookingScenario): Promise<void> {
    await test.step('Open the space as the signed-in customer', async () => {
      const spaceDetails = this.spaceDetailsFor(scenario);
      await spaceDetails.goto(scenario.space.id);

      await expect(spaceDetails.heading, 'The selected space should open.')
        .toBeVisible();
      await expect(
        spaceDetails.mainNavigation.getByText(scenario.customer.fullName, { exact: true }),
        'The authenticated customer should be shown in the navigation.'
      ).toBeVisible();
      await expect(
        spaceDetails.bookingIdentityFor(scenario.customer.fullName, scenario.customer.email),
        'The booking should use the authenticated customer identity.'
      ).toBeVisible();
    });
  }

  async selectAvailableSlot(scenario: BookingScenario): Promise<void> {
    await test.step('Select the requested booking slot', async () => {
      const spaceDetails = this.spaceDetailsFor(scenario);
      await spaceDetails.chooseBooking(scenario.date, scenario.durationHours);

      await expect(
        spaceDetails.startTimeButton(scenario.startTime),
        `The ${scenario.startTime} slot should be available.`
      ).toBeEnabled();
      await spaceDetails.selectStartTime(scenario.startTime);
    });
  }

  async verifyBookingPrice(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the booking price', async () => {
      const expectedTotal = formatTotal(scenario.expectedTotalCents);
      await expect(
        this.spaceDetailsFor(scenario).totalPrice.getByText(expectedTotal, { exact: true }),
        `The selected booking should total ${expectedTotal}.`
      ).toBeVisible();
    });
  }

  async confirmBooking(scenario: BookingScenario): Promise<void> {
    await test.step('Confirm the booking and verify its details', async () => {
      await this.spaceDetailsFor(scenario).confirmBooking();

      const bookingDetails = new BookingDetailsPage(this.page);
      await expect(bookingDetails.reference, 'A booking reference should be generated.')
        .toHaveText(/^SB-[A-F0-9]{14}$/);
      await expect(this.page, 'The customer should be taken to the booking confirmation.')
        .toHaveURL(/\/bookings\/[^/?#]+$/);

      this.confirmation = {
        reference: await bookingDetails.reference.innerText(),
        url: this.page.url()
      };
      await this.assertBookingDetails(scenario, this.confirmation);
    });
  }

  async reloadPage(): Promise<void> {
    await test.step('Reload the booking details page', async () => {
      await this.page.reload();
    });
  }

  async verifyBookingDetails(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the confirmed booking details', async () => {
      if (!this.confirmation) {
        throw new Error('Confirm the booking before verifying its persisted details.');
      }
      await this.assertBookingDetails(scenario, this.confirmation);
    });
  }

  async verifyRecoveredBookingDetails(scenario: BookingScenario, booking: Booking): Promise<void> {
    await test.step('Verify the recovered booking confirmation details', async () => {
      await this.assertBookingDetails(scenario, {
        reference: booking.reference,
        url: booking.confirmationUrl
      });
    });
  }

  private async assertBookingDetails(
    scenario: BookingScenario,
    confirmation: BookingConfirmation
  ): Promise<void> {
    const bookingDetails = new BookingDetailsPage(this.page);
    const expectedDate = DateTime.fromISO(scenario.date, { zone: scenario.timezone })
      .setLocale('en-GB')
      .toLocaleString({ day: 'numeric', month: 'long', year: 'numeric' });
    const expectedTotal = formatTotal(scenario.expectedTotalCents);
    const endTime = DateTime.fromFormat(scenario.startTime, 'HH:mm', { zone: scenario.timezone })
      .plus({ hours: scenario.durationHours })
      .toFormat('HH:mm');
    const expectedDuration =
      `${scenario.durationHours} ${scenario.durationHours === 1 ? 'hour' : 'hours'}`;

    await expect(this.page, 'The booking URL should remain unchanged.').toHaveURL(confirmation.url);
    await expect(bookingDetails.heading).toHaveText('Booking confirmed');
    await expect(bookingDetails.reference).toHaveText(confirmation.reference);
    await expect(bookingDetails.date).toHaveText(expectedDate);
    await expect(bookingDetails.time).toHaveText(`${scenario.startTime}–${endTime}`);
    await expect(bookingDetails.timezone).toHaveText(scenario.timezone);
    await expect(bookingDetails.duration).toHaveText(expectedDuration);
    await expect(bookingDetails.customerName).toHaveText(scenario.customer.fullName);
    await expect(bookingDetails.customerEmail).toHaveText(scenario.customer.email);
    await expect(bookingDetails.status).toHaveText(/^Confirmed(?: · Past)?$/);
    await expect(bookingDetails.total).toHaveText(expectedTotal);
  }

  private spaceDetailsFor(scenario: BookingScenario): SpaceDetailsPage {
    return new SpaceDetailsPage(this.page, scenario.space.name);
  }
}
