import { expect, test, type Page, type Response as BrowserResponse, type Route } from '@playwright/test';
import { DateTime } from 'luxon';
import type { ApiError, Booking, BookingInput } from '../../shared/contracts.js';
import { BookingApi } from '../api/BookingApi.js';
import { AccountPage } from '../pages/AccountPage.js';
import { SpaceDetailsPage } from '../pages/SpaceDetailsPage.js';
import { APP_ORIGIN } from '../support/testConfig.js';
import { TestDataManager, type TestAccount } from '../support/TestDataManager.js';
import { BookingFlow, type BookingScenario } from './BookingFlow.js';

type CapturedBookingRequest = {
  idempotencyKey: string;
  payload: BookingInput;
};

export class RecoveryFlow {
  private failedRequests = 0;
  private failingBookingsRequests = false;
  private bookingsFailureRoute: ((route: Route) => Promise<void>) | undefined;
  private readonly bookingApi: BookingApi;
  private competingBooking: Booking | undefined;
  private conflictResponse: BrowserResponse | undefined;
  private alternativeScenario: BookingScenario | undefined;
  private lostResponseRoute: ((route: Route) => Promise<void>) | undefined;
  private lostResponseRequestCount = 0;
  private firstBookingRequest: CapturedBookingRequest | undefined;
  private retryBookingRequest: CapturedBookingRequest | undefined;
  private originalBooking: Booking | undefined;
  private retryResponse: BrowserResponse | undefined;

  constructor(
    private readonly page: Page,
    private readonly account: TestAccount,
    private readonly bookingFlow: BookingFlow,
    private readonly testDataManager: TestDataManager
  ) {
    this.bookingApi = new BookingApi(account.request, APP_ORIGIN);
  }

  async failNextBookingsRequest(): Promise<void> {
    await test.step('Fail the next My Bookings request once', async () => {
      this.failingBookingsRequests = true;
      this.bookingsFailureRoute = async route => {
        if (route.request().method() !== 'GET' || !this.failingBookingsRequests) {
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
      };
      await this.page.route('**/api/me/bookings', this.bookingsFailureRoute);
    });
  }

  async verifyBookingsLoadFailed(booking: Booking): Promise<void> {
    await test.step('Verify the bookings error state is recoverable and private data is hidden', async () => {
      const accountPage = new AccountPage(this.page);
      await expect(accountPage.bookingsLoadError).toBeVisible();
      await expect(accountPage.retryBookingsButton).toBeVisible();
      await expect(accountPage.bookingRow(booking.reference)).toHaveCount(0);
      await expect(this.page.getByText(booking.spaceName, { exact: true })).toHaveCount(0);
      expect(this.failedRequests).toBeGreaterThan(0);
    });
  }

  async retryLoadingBookings(): Promise<void> {
    await test.step('Retry loading My Bookings', async () => {
      await this.stopFailingBookingsRequests();
      await new AccountPage(this.page).retryBookingsButton.click();
    });
  }

  async cleanup(): Promise<void> {
    try {
      await this.stopFailingBookingsRequests();
    } finally {
      if (this.lostResponseRoute) {
        await this.page.unroute('**/api/bookings', this.lostResponseRoute);
        this.lostResponseRoute = undefined;
      }
    }
  }

  async verifyBookingUnchangedInApi(booking: Booking): Promise<void> {
    await test.step('Verify the recovered booking is unchanged in the API', async () => {
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

  async attemptBooking(scenario: BookingScenario): Promise<void> {
    await test.step('Submit the selected booking as the customer', async () => {
      const responsePromise = this.page.waitForResponse(response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookings'
      );
      await new SpaceDetailsPage(this.page, scenario.space.name).confirmBooking();
      this.conflictResponse = await responsePromise;
    });
  }

  async verifyBookingConflictResponse(): Promise<void> {
    await test.step('Verify the booking was rejected by the real conflict API', async () => {
      if (!this.conflictResponse) {
        throw new Error('Attempt the competing booking before verifying the conflict.');
      }
      expect(this.conflictResponse.status()).toBe(409);
      const body = await this.conflictResponse.json() as ApiError;
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

  async selectAlternativeSlot(scenario: BookingScenario): Promise<void> {
    await test.step('Select an adjacent available slot', async () => {
      const alternativeStartTime = DateTime.fromFormat(
        scenario.startTime,
        'HH:mm',
        { zone: scenario.timezone }
      ).plus({ hours: scenario.durationHours }).toFormat('HH:mm');
      this.alternativeScenario = { ...scenario, startTime: alternativeStartTime };
      await this.bookingFlow.selectAvailableSlot(this.alternativeScenario);
    });
  }

  async confirmAlternativeBooking(): Promise<void> {
    await test.step('Confirm the alternative booking', async () => {
      await this.bookingFlow.confirmBooking(this.requireAlternativeScenario());
    });
  }

  async verifyAlternativeBookingDetails(): Promise<void> {
    await test.step('Verify the alternative booking confirmation', async () => {
      await this.bookingFlow.verifyBookingDetails(this.requireAlternativeScenario());
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

  async loseFirstBookingResponse(): Promise<void> {
    await test.step('Simulate losing the first booking response after the server saves it', async () => {
      if (this.lostResponseRoute) throw new Error('Booking response loss is already enabled.');

      this.lostResponseRoute = async (route: Route) => {
        const request = route.request();
        if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/bookings') {
          await route.continue();
          return;
        }

        this.lostResponseRequestCount += 1;
        const captured: CapturedBookingRequest = {
          idempotencyKey: request.headers()['idempotency-key'] ?? '',
          payload: request.postDataJSON() as BookingInput
        };

        if (this.lostResponseRequestCount === 1) {
          this.firstBookingRequest = captured;
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          const body = await response.json() as { booking: Booking };
          this.originalBooking = body.booking;
          await route.abort();
          return;
        }

        if (this.lostResponseRequestCount === 2) this.retryBookingRequest = captured;
        await route.continue();
      };

      await this.page.route('**/api/bookings', this.lostResponseRoute);
    });
  }

  async submitBookingWithLostResponse(scenario: BookingScenario): Promise<void> {
    await test.step('Submit the booking while the first response is interrupted', async () => {
      if (!this.lostResponseRoute) {
        throw new Error('Enable the lost-response simulation before booking.');
      }
      const firstRequestPromise = this.page.waitForRequest(request =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/bookings'
      );
      await new SpaceDetailsPage(this.page, scenario.space.name).confirmBooking();
      await firstRequestPromise;
    });
  }

  async verifyUncertainBookingState(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the customer sees a recoverable uncertain booking state', async () => {
      const details = new SpaceDetailsPage(this.page, scenario.space.name);
      await expect(details.uncertainBookingMessage).toBeVisible();
      await expect(this.page).toHaveURL(
        new URL(`/spaces/${scenario.space.id}`, APP_ORIGIN).toString()
      );
      await expect(details.dateInput).toHaveValue(scenario.date);
      await expect(details.durationSelect).toHaveValue(String(scenario.durationHours));
      await expect(details.startTimeButton(scenario.startTime))
        .toHaveAttribute('aria-pressed', 'true');
      await expect(details.retrySameBookingButton).toBeVisible();
      expect(this.lostResponseRequestCount).toBe(1);
      expect(this.firstBookingRequest).toBeDefined();
      expect(this.originalBooking).toBeDefined();
    });
  }

  async verifyOriginalBookingPersisted(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the interrupted booking was stored exactly once', async () => {
      const original = this.requireOriginalBooking();
      const expectedPayload: BookingInput = {
        spaceId: scenario.space.id,
        date: scenario.date,
        startTime: scenario.startTime,
        durationHours: scenario.durationHours
      };
      expect(this.firstBookingRequest?.idempotencyKey).toBeTruthy();
      expect(this.firstBookingRequest?.payload).toEqual(expectedPayload);
      expect(original).toMatchObject({
        spaceId: scenario.space.id,
        customerEmail: this.account.user.email,
        status: 'confirmed'
      });
      await this.expectOnlyOriginalBookingPersisted(scenario);
    });
  }

  async retrySameBooking(scenario: BookingScenario): Promise<void> {
    await test.step('Retry the same booking from the browser', async () => {
      this.requireOriginalBooking();
      const retryResponsePromise = this.page.waitForResponse(response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookings'
      );
      await new SpaceDetailsPage(this.page, scenario.space.name).retrySameBookingButton.click();
      this.retryResponse = await retryResponsePromise;
    });
  }

  async verifyIdempotentRecovery(): Promise<void> {
    await test.step('Verify the retry used the same submission and returned the original booking', async () => {
      const original = this.requireOriginalBooking();
      if (!this.retryResponse) throw new Error('Retry the booking before verifying idempotency.');
      expect(this.lostResponseRequestCount).toBe(2);
      expect(this.retryBookingRequest).toEqual(this.firstBookingRequest);
      expect(this.retryResponse.status()).toBe(200);
      const body = await this.retryResponse.json() as { booking: Booking };
      expect(body.booking).toEqual(original);
    });
  }

  async verifyRecoveredBookingDetails(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the original booking confirmation is restored', async () => {
      const original = this.requireOriginalBooking();
      await expect(this.page).toHaveURL(new URL(original.confirmationUrl).toString());
      await this.bookingFlow.verifyRecoveredBookingDetails(scenario, original);
    });
  }

  async verifyOnlyOneBookingPersisted(scenario: BookingScenario): Promise<void> {
    await test.step('Verify the successful retry did not create a duplicate booking', async () => {
      await this.expectOnlyOriginalBookingPersisted(scenario);
    });
  }

  async verifyRetryStateCleared(): Promise<void> {
    await test.step('Verify no uncertain booking state remains in the browser', async () => {
      expect(await this.page.evaluate(() =>
        sessionStorage.getItem('spacebook:uncertain-booking')
      )).toBeNull();
    });
  }

  private requireOriginalBooking(): Booking {
    if (!this.originalBooking) {
      throw new Error('Submit a booking with a lost response before checking its persistence.');
    }
    return this.originalBooking;
  }

  private requireAlternativeScenario(): BookingScenario {
    if (!this.alternativeScenario) {
      throw new Error('Select an alternative slot before confirming or verifying it.');
    }
    return this.alternativeScenario;
  }

  private async expectOnlyOriginalBookingPersisted(scenario: BookingScenario): Promise<void> {
    const bookingsForSpace = (await this.account.authApi.listBookings())
      .filter(booking => booking.spaceId === scenario.space.id);
    expect(bookingsForSpace).toHaveLength(1);
    expect(bookingsForSpace[0]).toEqual(this.requireOriginalBooking());
  }

  private async stopFailingBookingsRequests(): Promise<void> {
    this.failingBookingsRequests = false;
    if (this.bookingsFailureRoute) {
      await this.page.unroute('**/api/me/bookings', this.bookingsFailureRoute);
      this.bookingsFailureRoute = undefined;
    }
  }
}
