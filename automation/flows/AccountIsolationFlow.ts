import { expect, test, type Page, type Route } from '@playwright/test';
import { DateTime } from 'luxon';
import type { Booking } from '../../shared/contracts.js';
import { CURRENCY, TIMEZONE } from '../../shared/contracts.js';
import type { TestAccount } from '../support/TestDataManager.js';
import { AccountPage } from '../pages/AccountPage.js';
import { AuthPage } from '../pages/AuthPage.js';

export type AccountIsolationScenario = {
  customerA: TestAccount;
  customerB: TestAccount;
  booking: Booking;
};

const bookingsPath = '**/api/me/bookings';

export class AccountIsolationFlow {
  private bookingsRoute: ((route: Route) => Promise<void>) | undefined;
  private releaseHeldResponse: (() => void) | undefined;
  private heldResponseDelivered: Promise<void> | undefined;
  private delayedResponseError: Error | undefined;
  private delayedRequestCaptured = false;

  constructor(private readonly page: Page) {}

  async startDelayedBookingsRequest(scenario: AccountIsolationScenario): Promise<void> {
    await test.step('Sign in as customer A and hold a real bookings response', async () => {
      let markResponseReady!: () => void;
      let rejectResponseReady!: (error: Error) => void;
      const responseReady = new Promise<void>((resolve, reject) => {
        markResponseReady = resolve;
        rejectResponseReady = reject;
      });

      let releaseResponse!: () => void;
      const responseGate = new Promise<void>(resolve => {
        releaseResponse = resolve;
      });
      this.releaseHeldResponse = releaseResponse;

      let markResponseDelivered!: () => void;
      this.heldResponseDelivered = new Promise<void>(resolve => {
        markResponseDelivered = resolve;
      });

      this.bookingsRoute = async route => {
        if (route.request().method() !== 'GET' || this.delayedRequestCaptured) {
          await route.continue();
          return;
        }

        this.delayedRequestCaptured = true;
        try {
          const response = await route.fetch();
          markResponseReady();
          await responseGate;
          await route.fulfill({ response });
        } catch (error) {
          this.delayedResponseError = error instanceof Error ? error : new Error(String(error));
          rejectResponseReady(this.delayedResponseError);
          throw error;
        } finally {
          markResponseDelivered();
        }
      };
      await this.page.route(bookingsPath, this.bookingsRoute);

      try {
        const accountPage = new AccountPage(this.page);
        const authPage = new AuthPage(this.page);

        await this.page.goto('/spaces');
        await accountPage.signOut();
        await expect(accountPage.accountLink).toBeVisible();
        await authPage.gotoSignin();
        await authPage.signIn(scenario.customerA.credentials.email, scenario.customerA.credentials.password);
        await expect(accountPage.accountName(scenario.customerA.user.fullName)).toBeVisible();

        await accountPage.openMyBookings();
        await expect(accountPage.myBookingsHeading).toBeVisible();
        await responseReady;
      } catch (error) {
        this.releaseHeldResponse?.();
        throw error;
      }
    });
  }

  async switchAccount(scenario: AccountIsolationScenario): Promise<void> {
    await test.step('Switch to customer B through the authentication UI', async () => {
      const accountPage = new AccountPage(this.page);
      const authPage = new AuthPage(this.page);

      await accountPage.signOut();
      await expect(accountPage.accountLink).toBeVisible();
      await authPage.gotoSignin();
      await authPage.signIn(scenario.customerB.credentials.email, scenario.customerB.credentials.password);
      await expect(accountPage.accountName(scenario.customerB.user.fullName)).toBeVisible();
      await accountPage.openMyBookings();
      await expect(accountPage.myBookingsHeading).toBeVisible();
    });
  }

  async releaseDelayedBookingsResponse(): Promise<void> {
    await test.step('Release customer A’s delayed bookings response', async () => {
      if (!this.releaseHeldResponse || !this.heldResponseDelivered) {
        throw new Error('Start the delayed customer A bookings request before releasing the response.');
      }
      this.releaseHeldResponse();
      await this.heldResponseDelivered;
      if (this.delayedResponseError) throw this.delayedResponseError;
    });
  }

  async verifyBrowserDataIsolated(scenario: AccountIsolationScenario): Promise<void> {
    await test.step('Verify customer A’s late response cannot replace customer B’s browser data', async () => {
      const accountPage = new AccountPage(this.page);
      await expect.soft(accountPage.noBookingsHeading).toBeVisible();
      await expect.soft(accountPage.bookingRow(scenario.booking.reference)).toHaveCount(0);
      await expect.soft(accountPage.pageBody.getByText(scenario.customerA.user.fullName, { exact: true }))
        .toHaveCount(0);
      await expect.soft(accountPage.pageBody.getByText(scenario.customerA.user.email, { exact: true }))
        .toHaveCount(0);
      await expect.soft(accountPage.pageBody).not.toContainText(scenario.booking.spaceName);

      const start = DateTime.fromISO(scenario.booking.startsAt, { zone: 'utc' }).setZone(TIMEZONE);
      const end = DateTime.fromISO(scenario.booking.endsAt, { zone: 'utc' }).setZone(TIMEZONE);
      const bookingTime = `${start.toFormat('dd LLL yyyy · HH:mm')}–${end.toFormat('HH:mm')} · ${TIMEZONE}`;
      const bookingPrice = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: CURRENCY
      }).format(scenario.booking.totalPrice / 100);
      await expect.soft(accountPage.pageBody).not.toContainText(bookingTime);
      await expect.soft(accountPage.pageBody).not.toContainText(bookingPrice);
    });
  }

  async verifyApiDataIsolated(): Promise<void> {
    await test.step('Verify the browser’s authenticated API session returns only customer B’s bookings', async () => {
      const response = await this.page.context().request.get(
        new URL('/api/me/bookings', this.page.url()).toString()
      );
      expect(response.status()).toBe(200);
      const body = await response.json() as { bookings: Booking[] };
      expect(body.bookings).toEqual([]);
    });
  }

  async cleanup(): Promise<void> {
    this.releaseHeldResponse?.();
    if (this.bookingsRoute) {
      await this.page.unroute(bookingsPath, this.bookingsRoute);
      this.bookingsRoute = undefined;
    }
  }
}
