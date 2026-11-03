import type { Locator, Page } from '@playwright/test';

export class AccountPage {
  readonly accountMenu: Locator;
  readonly accountNavigation: Locator;
  readonly accountLink: Locator;
  readonly pageBody: Locator;
  readonly myBookingsHeading: Locator;
  readonly signInPrompt: Locator;
  readonly noBookingsHeading: Locator;
  readonly bookingsLoadError: Locator;
  readonly retryBookingsButton: Locator;
  readonly browseSpacesLink: Locator;
  readonly cancellationDialog: Locator;
  readonly keepBookingButton: Locator;
  readonly confirmCancellationButton: Locator;

  constructor(private readonly page: Page) {
    this.accountMenu = page.locator('summary[aria-label="Account menu"]');
    this.accountNavigation = page.getByRole('navigation', { name: 'Account' });
    this.accountLink = page.getByRole('link', { name: 'Account', exact: true });
    this.pageBody = page.locator('body');
    this.myBookingsHeading = page.getByRole('heading', { name: 'My Bookings' });
    this.signInPrompt = page.getByRole('heading', { name: 'Sign in to see your bookings.' });
    this.noBookingsHeading = page.getByRole('heading', { name: 'No bookings yet.' });
    this.bookingsLoadError = page.getByRole('heading', { name: 'Could not load bookings.', exact: true });
    this.retryBookingsButton = page.getByRole('button', { name: 'Retry', exact: true });
    this.browseSpacesLink = page.getByRole('link', { name: 'Browse spaces', exact: true });
    this.cancellationDialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
    this.keepBookingButton = this.cancellationDialog.getByRole('button', { name: 'Keep booking' });
    this.confirmCancellationButton = this.cancellationDialog.getByRole('button', { name: 'Yes, cancel booking' });
  }

  accountName(fullName: string): Locator {
    return this.accountMenu.getByText(fullName, { exact: true });
  }

  bookingRow(reference: string): Locator {
    return this.page.getByRole('article').filter({ hasText: reference });
  }

  bookingGroup(name: 'Upcoming' | 'Cancelled'): Locator {
    return this.page.getByRole('heading', { name: new RegExp(`^${name} \\(\\d+\\)$`) }).locator('..');
  }

  bookingGroupHeading(name: 'Upcoming' | 'Cancelled', count: number): Locator {
    return this.page.getByRole('heading', { name: `${name} (${count})`, exact: true });
  }

  bookingRowInGroup(name: 'Upcoming' | 'Cancelled', reference: string): Locator {
    return this.bookingGroup(name).getByRole('article').filter({ hasText: reference });
  }

  bookingReference(reference: string): Locator {
    return this.bookingRow(reference);
  }

  bookingSpaceName(reference: string): Locator {
    return this.bookingRow(reference).getByRole('heading', { level: 3 });
  }

  bookingStatus(reference: string, status: 'Confirmed' | 'Cancelled'): Locator {
    return this.bookingRow(reference).getByText(status, { exact: true });
  }

  bookingDetailsLink(reference: string): Locator {
    return this.bookingRow(reference).getByRole('link', { name: 'View' });
  }

  cancelBookingButton(reference: string): Locator {
    return this.bookingRow(reference).getByRole('button', { name: 'Cancel', exact: true });
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
