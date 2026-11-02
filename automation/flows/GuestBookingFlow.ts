import { expect, test, type Page } from '@playwright/test';
import type { Space } from '../../shared/contracts.js';
import type { TestAccount } from '../support/TestDataManager.js';
import { AuthPage } from '../pages/AuthPage.js';
import { SpaceDetailsPage } from '../pages/SpaceDetailsPage.js';

export type GuestBookingScenario = {
  space: Space;
  date: string;
  durationHours: number;
  startTime: string;
};

export class GuestBookingFlow {
  constructor(private readonly page: Page) {}

  async openSpace(scenario: GuestBookingScenario): Promise<void> {
    await test.step('Open a space as a guest', async () => {
      const spacePage = this.spacePage(scenario.space);
      await spacePage.goto(scenario.space.id);
      await expect(spacePage.heading).toBeVisible();
      await expect(
        spacePage.bookingIdentityForGuest,
        'The customer should be able to select a time without being signed in.'
      ).toBeVisible();
    });
  }

  async selectBooking(scenario: GuestBookingScenario): Promise<void> {
    await test.step('Select a future date, duration, and available time', async () => {
      const spacePage = this.spacePage(scenario.space);
      await spacePage.chooseBooking(scenario.date, scenario.durationHours);
      const startTime = spacePage.startTimeButton(scenario.startTime);
      await expect(startTime, 'The isolated future time should be available.').toBeEnabled();
      await spacePage.selectStartTime(scenario.startTime);
      await expect(startTime).toHaveAttribute('aria-pressed', 'true');
    });
  }

  async chooseSignInToBook(scenario: GuestBookingScenario): Promise<void> {
    await test.step('Choose to sign in before booking', async () => {
      await this.spacePage(scenario.space).signInToBookButton.click();
      const authPage = new AuthPage(this.page);
      await expect(authPage.signinHeading).toBeVisible();
      await expect(this.page).toHaveURL(
        new RegExp(`/auth\\?mode=signin&returnTo=.*${scenario.space.id}`)
      );
    });
  }

  async verifySelectionPreserved(
    scenario: GuestBookingScenario,
    account: TestAccount
  ): Promise<void> {
    await test.step('Verify the selected booking details survived signin', async () => {
      const spacePage = this.spacePage(scenario.space);
      await expect(this.page).toHaveURL(new RegExp(`/spaces/${scenario.space.id}$`));
      await expect(spacePage.heading).toBeVisible();
      await expect(spacePage.dateInput).toHaveValue(scenario.date);
      await expect(spacePage.durationSelect).toHaveValue(String(scenario.durationHours));
      const startTime = spacePage.startTimeButton(scenario.startTime);
      await expect(startTime).toBeEnabled();
      await expect(startTime).toHaveAttribute('aria-pressed', 'true');
      await expect(
        spacePage.bookingIdentityFor(account.user.fullName, account.user.email),
        'The signed-in account should be the customer for the preserved selection.'
      ).toBeVisible();
      await expect(spacePage.confirmBookingButton, 'Explicit confirmation should still be required.')
        .toBeVisible();
      await expect(spacePage.confirmBookingButton).toBeEnabled();
    });
  }

  async verifyNoBookingCreated(
    scenario: GuestBookingScenario,
    account: TestAccount
  ): Promise<void> {
    await test.step('Verify signin did not automatically create a booking', async () => {
      const bookings = await account.authApi.listBookings();
      expect(
        bookings.filter(booking => booking.spaceId === scenario.space.id),
        'Signing in should not create a booking for the selected space.'
      ).toHaveLength(0);
    });
  }

  private spacePage(space: Space): SpaceDetailsPage {
    return new SpaceDetailsPage(this.page, space.name);
  }
}
