import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { ApiError, Booking, User } from '../../shared/contracts.js';
import { CURRENCY, TIMEZONE } from '../../shared/contracts.js';
import type { SignupInput } from '../data/factories.js';
import { AccountPage } from '../pages/AccountPage.js';
import { AuthPage } from '../pages/AuthPage.js';
import { BookingDetailsPage } from '../pages/BookingDetailsPage.js';
import { SpaceApi } from '../api/SpaceApi.js';
import { APP_ORIGIN } from '../support/testConfig.js';
import type { TestAccount } from '../support/TestDataManager.js';

export class AccountFlow {
  constructor(private readonly page: Page) {}

  async signUp(credentials: SignupInput): Promise<void> {
    await test.step('Sign up through the browser', async () => {
      const authPage = new AuthPage(this.page);
      const accountPage = new AccountPage(this.page);
      await authPage.gotoSignup();
      await expect(authPage.heading, 'The signup form should be shown.')
        .toBeVisible();
      await authPage.signUp(credentials);
      await expect(
        accountPage.accountName(credentials.fullName),
        'The new account should be signed in after signup.'
      ).toBeVisible();
    });
  }

  async rejectMismatchedSignup(
    credentials: SignupInput,
    request: APIRequestContext
  ): Promise<void> {
    await test.step('Reject signup when password confirmation does not match', async () => {
      const authPage = new AuthPage(this.page);
      const accountPage = new AccountPage(this.page);
      const confirmationPassword = `${credentials.password}-mismatch`;
      await authPage.gotoSignup();
      await expect(authPage.heading, 'The signup form should be shown.')
        .toBeVisible();
      await authPage.signUp(credentials, confirmationPassword);

      await expect(authPage.confirmPasswordError)
        .toHaveText('Passwords do not match.');
      await expect(authPage.confirmPasswordInput)
        .toHaveAttribute('aria-describedby', 'confirmPassword-error');
      await expect(authPage.confirmPasswordInput)
        .toHaveAttribute('aria-invalid', 'true');
      await expect(authPage.confirmPasswordInput, 'Focus should move to the invalid confirmation field.')
        .toBeFocused();
      await expect(authPage.fullNameInput).toHaveValue(credentials.fullName);
      await expect(authPage.emailInput).toHaveValue(credentials.email);
      await expect(authPage.passwordInput).toHaveValue(credentials.password);
      await expect(authPage.confirmPasswordInput).toHaveValue(confirmationPassword);
      await expect(authPage.heading, 'The signup form should remain visible.')
        .toBeVisible();
      await expect(accountPage.accountLink, 'The customer should remain signed out.')
        .toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);

      const response = await request.post('/api/auth/signin', {
        headers: { Origin: APP_ORIGIN },
        data: { email: credentials.email, password: credentials.password }
      });
      await expectInvalidCredentials(response);
    });
  }

  async rejectIncorrectPassword(email: string, incorrectPassword: string): Promise<void> {
    await test.step('Reject signin with an incorrect password', async () => {
      const authPage = new AuthPage(this.page);
      const accountPage = new AccountPage(this.page);
      await authPage.gotoSignin();
      await expect(authPage.signinHeading, 'The signin form should be shown.')
        .toBeVisible();
      await authPage.signIn(email, incorrectPassword);

      await expect(authPage.message, 'The error should not reveal whether the account exists.')
        .toHaveText('The email or password is incorrect.');
      await expect(authPage.emailInput, 'The entered email should remain available for correction.')
        .toHaveValue(email);
      await expect(authPage.signinHeading, 'The customer should remain on the signin page.')
        .toBeVisible();
      await expect(this.page, 'Signin failure should not navigate away from the auth page.')
        .toHaveURL(/\/auth\?mode=signin$/);
      await expect(accountPage.accountLink, 'Signed-in actions should not appear.')
        .toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);

      await this.page.goto('/my-bookings');
      await expect(accountPage.signInPrompt, 'Private bookings should still require authentication.')
        .toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);
    });
  }

  async reloadAndVerifySession(fullName: string): Promise<void> {
    await test.step('Reload and verify the signup session persists', async () => {
      await this.page.reload();
      await expect(
        new AccountPage(this.page).accountName(fullName),
        'The account menu should still show the signed-in customer after reload.'
      ).toBeVisible();
    });
  }

  async openMyBookingsAndVerifyEmpty(): Promise<void> {
    await test.step('Open My Bookings and verify the empty state', async () => {
      const accountPage = new AccountPage(this.page);
      await accountPage.openMyBookings();
      await expect(this.page, 'My Bookings should open without a signin redirect.')
        .toHaveURL(/\/my-bookings$/);
      await expect(accountPage.myBookingsHeading).toBeVisible();
      await expect(accountPage.noBookingsHeading).toBeVisible();
      await expect(accountPage.browseSpacesLink, 'The empty state should offer a way to browse spaces.')
        .toBeVisible();
    });
  }

  async openOwnedBooking(booking: Booking): Promise<string> {
    return test.step('Open the owned booking from My Bookings', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/spaces');
      await expect(accountPage.accountName(booking.customerName))
        .toBeVisible();
      await accountPage.openMyBookings();
      await expect(accountPage.myBookingsHeading).toBeVisible();
      await expect(accountPage.bookingReference(booking.reference))
        .toContainText(booking.reference);
      await accountPage.bookingDetailsLink(booking.reference).click();

      const detailsPage = new BookingDetailsPage(this.page);
      await expect(detailsPage.heading).toHaveText('Booking confirmed');
      await expect(detailsPage.reference).toHaveText(booking.reference);
      await expect(detailsPage.customerName).toHaveText(booking.customerName);
      await expect(detailsPage.customerEmail).toHaveText(booking.customerEmail);
      return new URL(this.page.url()).pathname;
    });
  }

  async signOutAndVerifyGuestNavigation(): Promise<void> {
    await test.step('Sign out and verify guest navigation', async () => {
      const accountPage = new AccountPage(this.page);
      await accountPage.signOut();
      await expect(accountPage.accountLink, 'The guest account link should replace the signed-in menu.')
        .toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);
    });
  }

  async verifyPrivatePagesRequireSignIn(
    privateBookingPath: string,
    booking: Booking,
    account: User
  ): Promise<void> {
    await test.step('Verify signed-out users cannot access private booking data', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/my-bookings');
      await expect(accountPage.signInPrompt).toBeVisible();
      await expect(this.page.getByText(booking.reference, { exact: true })).toHaveCount(0);
      await expect(this.page.getByText(account.fullName, { exact: true })).toHaveCount(0);
      await expect(this.page.getByText(account.email, { exact: true })).toHaveCount(0);

      await this.page.goto(privateBookingPath);
      await expect(
        this.page.getByRole('heading', { name: 'We couldn’t find that page.' }),
        'The private booking route should be unavailable after signout.'
      ).toBeVisible();
      await expect(this.page.getByText(booking.reference, { exact: true })).toHaveCount(0);
      await expect(this.page.getByText(account.fullName, { exact: true })).toHaveCount(0);
      await expect(this.page.getByText(account.email, { exact: true })).toHaveCount(0);

      const response = await this.page.context().request.get(
        new URL('/api/auth/me', this.page.url()).toString()
      );
      expect(response.status(), 'The signed-out session should be rejected by the auth API.')
        .toBe(401);
      const body = await response.json() as ApiError;
      expect(body.error.code, 'The auth API should report an authentication requirement.')
        .toBe('AUTHENTICATION_REQUIRED');
    });
  }

  async signOutAndVerifyPrivateBookingProtection(booking: Booking, account: User): Promise<void> {
    await test.step('Sign out and verify private booking pages are protected', async () => {
      const privateBookingPath = await this.openOwnedBooking(booking);
      await this.signOutAndVerifyGuestNavigation();
      await this.verifyPrivatePagesRequireSignIn(privateBookingPath, booking, account);
    });
  }

  async verifyBookingOwnershipAndGroups(
    confirmedBooking: Booking,
    cancelledBooking: Booking,
    otherAccountBooking: Booking
  ): Promise<void> {
    await test.step('Open My Bookings and verify ownership and booking groups', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/spaces');
      await expect(accountPage.accountName(confirmedBooking.customerName))
        .toBeVisible();
      await accountPage.openMyBookings();
      await expect(accountPage.myBookingsHeading).toBeVisible();
      await expect(accountPage.bookingGroupHeading('Upcoming', 1)).toBeVisible();
      await expect(accountPage.bookingGroupHeading('Cancelled', 1)).toBeVisible();

      await this.verifyBookingRow(accountPage, confirmedBooking, 'Upcoming', 'Confirmed');
      await this.verifyBookingRow(accountPage, cancelledBooking, 'Cancelled', 'Cancelled');
      await expect(
        accountPage.bookingRow(otherAccountBooking.reference),
        'The other account’s booking must not be visible.'
      ).toHaveCount(0);
    });
  }

  async cancelBookingAndVerifyAvailability(
    booking: Booking,
    account: TestAccount
  ): Promise<void> {
    await test.step('Dismiss and confirm cancellation, then verify the slot is released', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/spaces');
      await expect(accountPage.accountName(booking.customerName))
        .toBeVisible();
      await accountPage.openMyBookings();
      await expect(accountPage.myBookingsHeading).toBeVisible();
      await expect(accountPage.bookingRowInGroup('Upcoming', booking.reference))
        .toBeVisible();
      await expect(accountPage.bookingStatus(booking.reference, 'Confirmed'))
        .toBeVisible();

      await accountPage.cancelBookingButton(booking.reference).click();
      await expect(accountPage.cancellationDialog).toBeVisible();
      await accountPage.keepBookingButton.click();
      await expect(accountPage.cancellationDialog).toBeHidden();
      await expect(accountPage.bookingStatus(booking.reference, 'Confirmed'))
        .toBeVisible();

      await accountPage.cancelBookingButton(booking.reference).click();
      await expect(accountPage.cancellationDialog).toBeVisible();
      await accountPage.confirmCancellationButton.click();
      await expect(accountPage.bookingRowInGroup('Cancelled', booking.reference))
        .toBeVisible();
      await expect(accountPage.bookingStatus(booking.reference, 'Cancelled'))
        .toBeVisible();
      await expect(accountPage.bookingRowInGroup('Upcoming', booking.reference))
        .toHaveCount(0);

      await this.page.reload();
      await expect(accountPage.bookingRowInGroup('Cancelled', booking.reference))
        .toBeVisible();
      await expect(accountPage.bookingStatus(booking.reference, 'Cancelled'))
        .toBeVisible();

      const localStart = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE);
      const availability = await new SpaceApi(account.request).getAvailability(
        booking.spaceId,
        localStart.toISODate()!,
        booking.durationHours
      );
      expect(
        availability.slots.some(slot => slot.startTime === localStart.toFormat('HH:mm')),
        'The cancelled booking’s original slot should be available again.'
      ).toBe(true);
    });
  }

  private async verifyBookingRow(
    accountPage: AccountPage,
    booking: Booking,
    group: 'Upcoming' | 'Cancelled',
    status: 'Confirmed' | 'Cancelled'
  ): Promise<void> {
    const row = accountPage.bookingRowInGroup(group, booking.reference);
    const start = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE);
    const end = DateTime.fromISO(booking.endsAt, { zone: 'utc' }).setZone(TIMEZONE);
    const expectedDateTime = `${start.toFormat('dd LLL yyyy · HH:mm')}–${end.toFormat('HH:mm')} · ${TIMEZONE}`;
    const expectedTotal = new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: CURRENCY
    }).format(booking.totalPrice / 100);

    await expect(row, `Booking ${booking.reference} should belong in the ${group} group.`)
      .toBeVisible();
    await expect(row.getByRole('heading', { level: 3 })).toHaveText(booking.spaceName);
    await expect(row).toContainText(booking.reference);
    await expect(row).toContainText(expectedDateTime);
    await expect(row).toContainText(expectedTotal);
    await expect(accountPage.bookingStatus(booking.reference, status)).toBeVisible();
  }
}

async function expectInvalidCredentials(response: APIResponse): Promise<void> {
  expect(response.status(), 'Signin with a rejected signup identity should return 401.')
    .toBe(401);
  const body = await response.json() as ApiError;
  expect(body.error.code, 'The API should prove no account was created.')
    .toBe('INVALID_CREDENTIALS');
}
