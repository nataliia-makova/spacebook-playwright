import type { Locator, Page } from '@playwright/test';

export class SpaceDetailsPage {
  readonly heading: Locator;
  readonly mainNavigation: Locator;
  readonly dateInput: Locator;
  readonly durationSelect: Locator;
  readonly totalPrice: Locator;
  readonly bookingConflictMessage: Locator;
  readonly availabilityRefreshedMessage: Locator;
  readonly uncertainBookingMessage: Locator;
  readonly retrySameBookingButton: Locator;
  readonly confirmBookingButton: Locator;
  readonly signInToBookButton: Locator;
  readonly bookingIdentityForGuest: Locator;

  constructor(
    private readonly page: Page,
    spaceName: string
  ) {
    this.heading = page.getByRole('heading', { name: spaceName });
    this.mainNavigation = page.getByRole('navigation', { name: 'Main' });
    this.dateInput = page.getByLabel('Date');
    this.durationSelect = page.getByLabel('Duration');
    this.totalPrice = page.getByText('Total', { exact: true })
      .locator('..');
    this.bookingConflictMessage = page.getByText(
      'Someone just reserved this slot. Choose another available time.',
      { exact: true }
    );
    this.availabilityRefreshedMessage = page.getByText('Availability has been refreshed.', {
      exact: true
    });
    this.uncertainBookingMessage = page.getByText(
      'We couldn’t verify whether this booking was saved. Your details and submission identifier are preserved. Retry this same request—do not start a new booking.',
      { exact: true }
    );
    this.retrySameBookingButton = page.getByRole('button', {
      name: 'Retry same booking',
      exact: true
    });
    this.confirmBookingButton = page.getByRole('button', { name: 'Confirm booking' });
    this.signInToBookButton = page.getByRole('button', { name: 'Sign in to book' });
    this.bookingIdentityForGuest = page.getByText(
      'You can choose a time as a guest. Sign in or create an account to reserve it.',
      { exact: true }
    );
  }

  async goto(spaceId: string): Promise<void> {
    await this.page.goto(`/spaces/${spaceId}`);
  }

  async chooseBooking(date: string, durationHours: number): Promise<void> {
    await this.dateInput.fill(date);
    await this.durationSelect.selectOption(String(durationHours));
  }

  async selectStartTime(startTime: string): Promise<void> {
    await this.startTimeButton(startTime).click();
  }

  startTimeButton(startTime: string): Locator {
    return this.page.getByRole('button', { name: `${startTime} available` });
  }

  unavailableStartTimeButton(startTime: string): Locator {
    return this.page.getByRole('button', { name: `${startTime} unavailable` });
  }

  bookingIdentityFor(customerName: string, customerEmail: string): Locator {
    return this.page.getByText(`Booking for ${customerName} (${customerEmail})`, { exact: true });
  }

  async confirmBooking(): Promise<void> {
    await this.confirmBookingButton.click();
  }
}
