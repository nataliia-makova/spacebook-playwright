import type { Locator, Page } from '@playwright/test';

export class SpaceDetailsPage {
  readonly heading: Locator;
  readonly mainNavigation: Locator;
  readonly dateInput: Locator;
  readonly durationSelect: Locator;
  readonly bookingIdentity: Locator;
  readonly totalPrice: Locator;
  readonly confirmBookingButton: Locator;

  constructor(
    private readonly page: Page,
    spaceName: string,
    customerName: string,
    customerEmail: string
  ) {
    this.heading = page.getByRole('heading', { name: spaceName });
    this.mainNavigation = page.getByRole('navigation', { name: 'Main' });
    this.dateInput = page.getByLabel('Date');
    this.durationSelect = page.getByLabel('Duration');
    this.bookingIdentity = page.getByText(`Booking for ${customerName} (${customerEmail})`);
    this.totalPrice = page.getByText('Total', { exact: true })
      .locator('..');
    this.confirmBookingButton = page.getByRole('button', { name: 'Confirm booking' });
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

  async confirmBooking(): Promise<void> {
    await this.confirmBookingButton.click();
  }
}
