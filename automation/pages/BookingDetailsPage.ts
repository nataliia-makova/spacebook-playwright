import type { Locator, Page } from '@playwright/test';

function valueFor(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('..').locator('strong');
}

export class BookingDetailsPage {
  readonly heading: Locator;
  readonly reference: Locator;
  readonly date: Locator;
  readonly time: Locator;
  readonly timezone: Locator;
  readonly duration: Locator;
  readonly customerName: Locator;
  readonly customerEmail: Locator;
  readonly status: Locator;
  readonly total: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Booking confirmed' });
    this.reference = page.getByText('Booking reference', { exact: true })
      .locator('..')
      .locator('strong');
    this.date = valueFor(page, 'Date');
    this.time = valueFor(page, 'Time');
    this.timezone = valueFor(page, 'Timezone');
    this.duration = valueFor(page, 'Duration');
    this.customerName = valueFor(page, 'Name');
    this.customerEmail = valueFor(page, 'Email');
    this.status = page.getByRole('status').filter({ hasText: /^Confirmed$/ });
    this.total = valueFor(page, 'Total');
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
  }
}
