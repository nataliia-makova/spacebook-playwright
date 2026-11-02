import type { Locator, Page } from '@playwright/test';

export class AccountPage {
  readonly accountMenu: Locator;
  readonly accountNavigation: Locator;
  readonly accountLink: Locator;
  readonly myBookingsHeading: Locator;
  readonly signInPrompt: Locator;
  readonly noBookingsHeading: Locator;
  readonly browseSpacesLink: Locator;

  constructor(private readonly page: Page) {
    this.accountMenu = page.locator('summary[aria-label="Account menu"]');
    this.accountNavigation = page.getByRole('navigation', { name: 'Account' });
    this.accountLink = page.getByRole('link', { name: 'Account', exact: true });
    this.myBookingsHeading = page.getByRole('heading', { name: 'My Bookings' });
    this.signInPrompt = page.getByRole('heading', { name: 'Sign in to see your bookings.' });
    this.noBookingsHeading = page.getByRole('heading', { name: 'No bookings yet.' });
    this.browseSpacesLink = page.getByRole('link', { name: 'Browse spaces', exact: true });
  }

  accountName(fullName: string): Locator {
    return this.accountMenu.getByText(fullName, { exact: true });
  }

  bookingRow(reference: string): Locator {
    return this.page.getByRole('article').filter({ hasText: reference });
  }

  bookingReference(reference: string): Locator {
    return this.bookingRow(reference);
  }

  bookingDetailsLink(reference: string): Locator {
    return this.bookingRow(reference).getByRole('link', { name: 'View' });
  }

  async openMyBookings(): Promise<void> {
    await this.accountMenu.click();
    await this.accountNavigation.getByRole('link', { name: 'My Bookings' }).click();
  }

  async signOut(): Promise<void> {
    await this.accountMenu.click();
    await this.accountNavigation.getByRole('button', { name: 'Sign out' }).click();
  }
}
