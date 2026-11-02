import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import type { ApiError, Booking, User } from '../../shared/contracts.js';
import type { SignupInput } from '../data/factories.js';
import { AccountPage } from '../pages/AccountPage.js';
import { AuthPage } from '../pages/AuthPage.js';
import { BookingDetailsPage } from '../pages/BookingDetailsPage.js';
import { APP_ORIGIN } from '../support/testConfig.js';

export class AccountFlow {
  private privateBookingPath: string | undefined;

  constructor(private readonly page: Page) {}

  async signUp(credentials: SignupInput): Promise<void> {
    await test.step('Sign up through the browser', async () => {
      const authPage = new AuthPage(this.page);
      const accountPage = new AccountPage(this.page);
      await authPage.gotoSignup();
      await expect(authPage.heading, 'The signup form should be shown.').toBeVisible();
      await authPage.signUp(credentials);
      await expect(
        accountPage.accountName(credentials.fullName),
        'The new account should be signed in after signup.'
      ).toBeVisible();
    });
  }

  async reloadPage(): Promise<void> {
    await test.step('Reload the current page', async () => {
      await this.page.reload();
    });
  }

  async verifySignedIn(fullName: string): Promise<void> {
    await test.step('Verify the customer remains signed in', async () => {
      await expect(
        new AccountPage(this.page).accountName(fullName),
        'The account menu should show the signed-in customer.'
      ).toBeVisible();
    });
  }

  async submitMismatchedSignup(credentials: SignupInput): Promise<void> {
    await test.step('Submit signup with mismatched password confirmation', async () => {
      const authPage = new AuthPage(this.page);
      await authPage.gotoSignup();
      await expect(authPage.heading, 'The signup form should be shown.').toBeVisible();
      await authPage.signUp(credentials, `${credentials.password}-mismatch`);
    });
  }

  async verifySignupRejected(credentials: SignupInput): Promise<void> {
    await test.step('Verify signup validation keeps the form and entered details', async () => {
      const authPage = new AuthPage(this.page);
      const accountPage = new AccountPage(this.page);
      const confirmationPassword = `${credentials.password}-mismatch`;

      await expect(authPage.confirmPasswordError).toHaveText('Passwords do not match.');
      await expect(authPage.confirmPasswordInput)
        .toHaveAttribute('aria-describedby', 'confirmPassword-error');
      await expect(authPage.confirmPasswordInput).toHaveAttribute('aria-invalid', 'true');
      await expect(authPage.confirmPasswordInput, 'Focus should move to the invalid confirmation field.')
        .toBeFocused();
      await expect(authPage.fullNameInput).toHaveValue(credentials.fullName);
      await expect(authPage.emailInput).toHaveValue(credentials.email);
      await expect(authPage.passwordInput).toHaveValue(credentials.password);
      await expect(authPage.confirmPasswordInput).toHaveValue(confirmationPassword);
      await expect(authPage.heading, 'The signup form should remain visible.').toBeVisible();
      await expect(accountPage.accountLink, 'The customer should remain signed out.').toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);
    });
  }

  async verifyAccountNotCreated(
    credentials: SignupInput,
    request: APIRequestContext
  ): Promise<void> {
    await test.step('Verify the rejected signup did not create an account', async () => {
      const response = await request.post('/api/auth/signin', {
        headers: { Origin: APP_ORIGIN },
        data: { email: credentials.email, password: credentials.password }
      });
      await expectInvalidCredentials(response);
    });
  }

  async signInWithWrongPassword(credentials: SignupInput): Promise<void> {
    await test.step('Submit an incorrect password through the signin form', async () => {
      const authPage = new AuthPage(this.page);
      await authPage.gotoSignin();
      await expect(authPage.signinHeading, 'The signin form should be shown.').toBeVisible();
      await authPage.signIn(credentials.email, `${credentials.password}-incorrect`);
    });
  }

  async verifySignInRejected(email: string): Promise<void> {
    await test.step('Verify signin was rejected without revealing account validity', async () => {
      const authPage = new AuthPage(this.page);
      const accountPage = new AccountPage(this.page);
      await expect(authPage.message, 'The error should not reveal whether the account exists.')
        .toHaveText('The email or password is incorrect.');
      await expect(authPage.emailInput, 'The entered email should remain available for correction.')
        .toHaveValue(email);
      await expect(authPage.signinHeading, 'The customer should remain on the signin page.')
        .toBeVisible();
      await expect(this.page).toHaveURL(/\/auth\?mode=signin$/);
      await expect(accountPage.accountLink, 'Signed-in actions should not appear.').toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);
    });
  }

  async verifySignInRequired(): Promise<void> {
    await test.step('Verify private bookings still require signin', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/my-bookings');
      await expect(accountPage.signInPrompt).toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);
    });
  }

  async signIn(credentials: SignupInput): Promise<void> {
    await test.step('Sign in through the browser', async () => {
      const authPage = new AuthPage(this.page);
      await authPage.signIn(credentials.email, credentials.password);
    });
  }

  async openBookingDetails(booking: Booking): Promise<void> {
    await test.step('Open the booking details from My Bookings', async () => {
      const accountPage = new AccountPage(this.page);
      await this.page.goto('/spaces');
      await expect(accountPage.accountName(booking.customerName)).toBeVisible();
      await accountPage.openMyBookings();
      await expect(accountPage.myBookingsHeading).toBeVisible();
      await accountPage.bookingDetailsLink(booking.reference).click();
      this.privateBookingPath = new URL(this.page.url()).pathname;
    });
  }

  async verifyBookingDetails(booking: Booking): Promise<void> {
    await test.step('Verify the selected booking details', async () => {
      const detailsPage = new BookingDetailsPage(this.page);
      await expect(detailsPage.heading).toHaveText('Booking confirmed');
      await expect(detailsPage.reference).toHaveText(booking.reference);
      await expect(detailsPage.customerName).toHaveText(booking.customerName);
      await expect(detailsPage.customerEmail).toHaveText(booking.customerEmail);
    });
  }

  async signOut(): Promise<void> {
    await test.step('Sign out of the customer account', async () => {
      await new AccountPage(this.page).signOut();
    });
  }

  async verifyGuestNavigation(): Promise<void> {
    await test.step('Verify guest navigation after signout', async () => {
      const accountPage = new AccountPage(this.page);
      await expect(accountPage.accountLink, 'The guest account link should replace the signed-in menu.')
        .toBeVisible();
      await expect(accountPage.accountMenu).toHaveCount(0);
    });
  }

  async verifyPrivatePagesRequireSignIn(
    booking: Booking,
    account: User
  ): Promise<void> {
    await test.step('Verify signed-out users cannot access private booking data', async () => {
      if (!this.privateBookingPath) {
        throw new Error('Open the customer booking details before verifying private-page protection.');
      }

      const accountPage = new AccountPage(this.page);
      await this.page.goto('/my-bookings');
      await expect(accountPage.signInPrompt).toBeVisible();
      await expect(this.page.getByText(booking.reference, { exact: true })).toHaveCount(0);
      await expect(this.page.getByText(account.fullName, { exact: true })).toHaveCount(0);
      await expect(this.page.getByText(account.email, { exact: true })).toHaveCount(0);

      await this.page.goto(this.privateBookingPath);
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
}

async function expectInvalidCredentials(response: APIResponse): Promise<void> {
  expect(response.status(), 'Signin with a rejected signup identity should return 401.')
    .toBe(401);
  const body = await response.json() as ApiError;
  expect(body.error.code, 'The API should prove no account was created.')
    .toBe('INVALID_CREDENTIALS');
}
