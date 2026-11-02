import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { ApiError, Booking, BookingInput } from '../../shared/contracts.js';
import { BookingApi } from '../api/BookingApi.js';
import { AccountPage } from '../pages/AccountPage.js';
import { SpaceDetailsPage } from '../pages/SpaceDetailsPage.js';
import { APP_ORIGIN } from '../support/testConfig.js';
import { TestDataManager, type TestAccount } from '../support/TestDataManager.js';
import { BookingFlow, type BookingScenario } from './BookingFlow.js';
import { MyBookingsFlow } from './MyBookingsFlow.js';

export class RecoveryFlow {
  private failedRequests = 0;
  private readonly bookingApi: BookingApi;
  private competingBooking: Booking | undefined;

  constructor(
    private readonly page: Page,
    private readonly account: TestAccount,
    private readonly bookingFlow: BookingFlow,
    private readonly testDataManager: TestDataManager,
    private readonly myBookingsFlow: MyBookingsFlow
  ) {
    this.bookingApi = new BookingApi(account.request, APP_ORIGIN);
  }

  async failNextBookingsRequest(): Promise<void> {
    await test.step('Fail the next My Bookings request once', async () => {
      await this.page.route('**/api/me/bookings', async route => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }

        this.failedRequests += 1;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong on the server. Please try again.'
            }
          })
        });
      }, { times: 1 });
    });
  }

  async verifyBookingsLoadFailed(booking: Booking): Promise<void> {
    await test.step('Verify the bookings error state is recoverable and private data is hidden', async () => {
      const accountPage = new AccountPage(this.page);
      await expect(accountPage.bookingsLoadError).toBeVisible();
      await expect(accountPage.retryBookingsButton).toBeVisible();
      await expect(accountPage.bookingRow(booking.reference)).toHaveCount(0);
      await expect(this.page.getByText(booking.spaceName, { exact: true })).toHaveCount(0);
      expect(this.failedRequests).toBe(1);
    });
  }

  async retryLoadingBookings(): Promise<void> {
    await test.step('Retry loading My Bookings', async () => {
      await new AccountPage(this.page).retryBookingsButton.click();
    });
  }

  async verifyBookingVisible(booking: Booking): Promise<void> {
    await test.step('Verify the booking is visible after recovery', async () => {
      await this.myBookingsFlow.verifyBookingConfirmed(booking);
    });

    await test.step('Verify the booking is unchanged in the backend', async () => {
      const response = await this.bookingApi.getByConfirmation(booking);
      expect(response.status()).toBe(200);
      const body = await response.json() as { booking: Booking };
      expect(body.booking).toEqual(booking);
    });
  }

  async bookSelectedSlotAsAnotherCustomer(
    scenario: BookingScenario,
    competingAccount: TestAccount
  ): Promise<void> {
    await test.step('Book the selected slot as the competing customer through the real API', async () => {
      this.competingBooking = await this.testDataManager.createBooking(competingAccount, {
        spaceId: scenario.space.id,
        date: scenario.date,
        startTime: scenario.startTime,
        durationHours: scenario.durationHours
      });

      expect(this.competingBooking.status).toBe('confirmed');
      expect(this.competingBooking.customerEmail).toBe(competingAccount.user.email);
    });
  }

  async attemptBooking(): Promise<void> {
    await test.step('Submit the selected booking and verify the real conflict response', async () => {
      const responsePromise = this.page.waitForResponse(response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookings'
      );
      await this.page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
      const response = await responsePromise;

      expect(response.status()).toBe(409);
      const body = await response.json() as ApiError;
      expect(body.error.code).toBe('BOOKING_CONFLICT');
    });
  }

  async verifyConflictAndRefresh(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the conflict message and refreshed availability', async () => {
      const spaceDetails = new SpaceDetailsPage(this.page, scenario.space.name);
      await expect(spaceDetails.bookingConflictMessage).toBeVisible();
      await expect(spaceDetails.availabilityRefreshedMessage).toBeVisible();
      await expect(spaceDetails.unavailableStartTimeButton(scenario.startTime))
        .toBeDisabled();
    });
  }

  async bookAlternativeSlot(scenario: BookingScenario): Promise<void> {
    await test.step('Select and confirm the adjacent available booking slot', async () => {
      const alternativeStartTime = DateTime.fromFormat(
        scenario.startTime,
        'HH:mm',
        { zone: scenario.timezone }
      ).plus({ hours: scenario.durationHours }).toFormat('HH:mm');
      const alternativeScenario = { ...scenario, startTime: alternativeStartTime };

      await this.bookingFlow.selectAvailableSlot(alternativeScenario);
      await this.bookingFlow.confirmBooking(alternativeScenario);
    });
  }

  async verifySeparateBookings(
    scenario: BookingScenario,
    account: TestAccount,
    competingAccount: TestAccount
  ): Promise<void> {
    await test.step('Verify each customer owns only their expected booking', async () => {
      if (!this.competingBooking) {
        throw new Error('Book the selected slot as the competing customer before verifying bookings.');
      }

      const [customerBookings, competingBookings] = await Promise.all([
        account.authApi.listBookings(),
        competingAccount.authApi.listBookings()
      ]);
      const customerSpaceBookings = customerBookings.filter(
        booking => booking.spaceId === scenario.space.id
      );
      const competingSpaceBookings = competingBookings.filter(
        booking => booking.spaceId === scenario.space.id
      );
      const alternativeStartTime = DateTime.fromFormat(
        scenario.startTime,
        'HH:mm',
        { zone: scenario.timezone }
      ).plus({ hours: scenario.durationHours }).toFormat('HH:mm');
      const localStartTime = (booking: Booking) => DateTime.fromISO(booking.startsAt, {
        zone: 'utc'
      }).setZone(scenario.timezone).toFormat('yyyy-MM-dd HH:mm');

      expect(competingSpaceBookings).toHaveLength(1);
      expect(competingSpaceBookings[0]).toEqual(this.competingBooking);
      expect(competingSpaceBookings[0]).toMatchObject({
        customerEmail: competingAccount.user.email,
        status: 'confirmed'
      });
      expect(localStartTime(competingSpaceBookings[0]!))
        .toBe(`${scenario.date} ${scenario.startTime}`);

      expect(customerSpaceBookings).toHaveLength(1);
      expect(customerSpaceBookings[0]).toMatchObject({
        customerEmail: account.user.email,
        status: 'confirmed'
      });
      expect(localStartTime(customerSpaceBookings[0]!))
        .toBe(`${scenario.date} ${alternativeStartTime}`);
      expect(customerSpaceBookings[0]!.reference)
        .not.toBe(this.competingBooking.reference);
    });
  }

  async verifyRetryAfterLostResponse(
    scenario: BookingScenario,
    account: TestAccount
  ): Promise<void> {
    type CapturedRequest = {
      idempotencyKey: string;
      payload: BookingInput;
    };

    let requestCount = 0;
    let firstRequest: CapturedRequest | undefined;
    let retryRequest: CapturedRequest | undefined;
    let originalBooking: Booking | undefined;
    const bookingRoute = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
      const request = route.request();
      if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/bookings') {
        await route.continue();
        return;
      }

      requestCount += 1;
      const capturedRequest = {
        idempotencyKey: request.headers()['idempotency-key'] ?? '',
        payload: request.postDataJSON() as BookingInput
      };

      if (requestCount === 1) {
        firstRequest = capturedRequest;
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        const body = await response.json() as { booking: Booking };
        originalBooking = body.booking;
        await route.abort();
        return;
      }

      if (requestCount === 2) retryRequest = capturedRequest;
      await route.continue();
    };

    await this.page.route('**/api/bookings', bookingRoute);
    try {
      await test.step('Create the booking on the server and lose only its first browser response', async () => {
        const spaceDetails = new SpaceDetailsPage(this.page, scenario.space.name);
        const firstRequestPromise = this.page.waitForRequest(request =>
          request.method() === 'POST' &&
          new URL(request.url()).pathname === '/api/bookings'
        );
        await spaceDetails.confirmBookingButton.click();
        await firstRequestPromise;

        await expect(spaceDetails.uncertainBookingMessage).toBeVisible();
        await expect(this.page).toHaveURL(
          new URL(`/spaces/${scenario.space.id}`, APP_ORIGIN).toString()
        );
        await expect(spaceDetails.dateInput).toHaveValue(scenario.date);
        await expect(spaceDetails.durationSelect).toHaveValue(String(scenario.durationHours));
        await expect(spaceDetails.startTimeButton(scenario.startTime))
          .toHaveAttribute('aria-pressed', 'true');
        await expect(spaceDetails.retrySameBookingButton).toBeVisible();
        expect(requestCount).toBe(1);
        expect(firstRequest).toBeDefined();
        expect(originalBooking).toBeDefined();
      });

      await test.step('Verify the uncertain booking was persisted before retrying', async () => {
        const expectedPayload: BookingInput = {
          spaceId: scenario.space.id,
          date: scenario.date,
          startTime: scenario.startTime,
          durationHours: scenario.durationHours
        };
        expect(firstRequest?.idempotencyKey).toBeTruthy();
        expect(firstRequest?.payload).toEqual(expectedPayload);
        expect(originalBooking).toMatchObject({
          spaceId: scenario.space.id,
          customerEmail: account.user.email,
          status: 'confirmed'
        });

        const bookingsForSpace = (await account.authApi.listBookings())
          .filter(booking => booking.spaceId === scenario.space.id);
        expect(bookingsForSpace).toHaveLength(1);
        expect(bookingsForSpace[0]).toEqual(originalBooking);
      });

      await test.step('Retry with the same key and payload and verify the backend replay', async () => {
        const retryResponsePromise = this.page.waitForResponse(response =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/bookings'
        );
        await this.page.getByRole('button', { name: 'Retry same booking', exact: true }).click();
        const response = await retryResponsePromise;
        const responseBody = await response.json() as { booking: Booking };

        expect(requestCount).toBe(2);
        expect(retryRequest).toEqual(firstRequest);
        expect(response.status()).toBe(200);
        expect(responseBody.booking).toEqual(originalBooking);
      });

      await test.step('Verify confirmation and ensure recovery leaves exactly one booking', async () => {
        if (!originalBooking) {
          throw new Error('The original booking response was not captured.');
        }

        await expect(this.page).toHaveURL(new URL(originalBooking.confirmationUrl).toString());
        await this.bookingFlow.verifyRecoveredBookingDetails(scenario, originalBooking);

        const bookingsForSpace = (await account.authApi.listBookings())
          .filter(booking => booking.spaceId === scenario.space.id);
        expect(bookingsForSpace).toHaveLength(1);
        expect(bookingsForSpace[0]).toEqual(originalBooking);
        expect(await this.page.evaluate(() =>
          sessionStorage.getItem('spacebook:uncertain-booking')
        )).toBeNull();
      });
    } finally {
      await this.page.unroute('**/api/bookings', bookingRoute);
    }
  }
}
