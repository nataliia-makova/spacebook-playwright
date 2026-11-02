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

export type BookingConfirmation = {
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

  async confirmAndVerify(scenario: BookingScenario): Promise<BookingConfirmation> {
    return test.step('Confirm the booking and verify its details', async () => {
      await this.spaceDetailsFor(scenario).confirmBooking();

      const bookingDetails = new BookingDetailsPage(this.page);
      await expect(bookingDetails.reference, 'A booking reference should be generated.')
        .toHaveText(/^SB-[A-F0-9]{14}$/);
      await expect(this.page, 'The customer should be taken to the booking confirmation.')
        .toHaveURL(/\/bookings\/[^/?#]+$/);

      const confirmation = {
        reference: await bookingDetails.reference.innerText(),
        url: this.page.url()
      };
      await this.verifyBookingDetails(scenario, confirmation, 'confirmed');
      return confirmation;
    });
  }

  async verifyConfirmationPersists(
    scenario: BookingScenario,
    confirmation: BookingConfirmation
  ): Promise<void> {
    await test.step('Verify the booking persists after reload', async () => {
      await new BookingDetailsPage(this.page).reload();
      await this.verifyBookingDetails(scenario, confirmation, 'confirmed');
    });
  }

  async confirmBookingAndVerifyPersistence(scenario: BookingScenario): Promise<void> {
    const confirmation = await this.confirmAndVerify(scenario);
    await this.verifyConfirmationPersists(scenario, confirmation);
  }

  async verifyBookingDetails(
    scenario: BookingScenario,
    confirmation: BookingConfirmation,
    status: Booking['status']
  ): Promise<void> {
    const bookingDetails = new BookingDetailsPage(this.page);
    const expectedDate = DateTime.fromISO(scenario.date, { zone: scenario.timezone })
      .setLocale('en-GB')
      .toLocaleString({ day: 'numeric', month: 'long', year: 'numeric' });
    const expectedTotal = formatTotal(scenario.expectedTotalCents);
    const endTime = DateTime.fromFormat(scenario.startTime, 'HH:mm', { zone: scenario.timezone })
      .plus({ hours: scenario.durationHours })
      .toFormat('HH:mm');
    const expectedHeading = status === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled';
    const expectedStatus = status === 'confirmed' ? /^Confirmed(?: · Past)?$/ : 'Cancelled';
    const expectedDuration = `${scenario.durationHours} ${scenario.durationHours === 1 ? 'hour' : 'hours'}`;

    await expect(this.page, 'The booking URL should remain unchanged.')
      .toHaveURL(confirmation.url);
    await expect(bookingDetails.heading, 'The page should show the expected booking state.')
      .toHaveText(expectedHeading);
    await expect(bookingDetails.reference, 'The booking reference should match the created booking.')
      .toHaveText(confirmation.reference);
    await expect(bookingDetails.date, 'The booking date should match the selected date.')
      .toHaveText(expectedDate);
    await expect(bookingDetails.time, 'The booking time should match the selected slot.')
      .toHaveText(`${scenario.startTime}–${endTime}`);
    await expect(bookingDetails.timezone, 'The booking should use the expected timezone.')
      .toHaveText(scenario.timezone);
    await expect(bookingDetails.duration, 'The booking duration should match the selected duration.')
      .toHaveText(expectedDuration);
    await expect(bookingDetails.customerName, 'The booking should belong to the authenticated customer.')
      .toHaveText(scenario.customer.fullName);
    await expect(bookingDetails.customerEmail, 'The booking should show the authenticated customer email.')
      .toHaveText(scenario.customer.email);
    await expect(bookingDetails.status, 'The booking status should match the expected state.')
      .toHaveText(expectedStatus);
    await expect(bookingDetails.total, 'The booking total should match the independent expected amount.')
      .toHaveText(expectedTotal);
  }

  private spaceDetailsFor(scenario: BookingScenario): SpaceDetailsPage {
    return new SpaceDetailsPage(this.page, scenario.space.name);
  }
}
