import { DateTime } from 'luxon';
import { test, expect } from '../../fixtures/auth-fixtures.js';
import { BookingDetailsPage } from '../../pages/BookingDetailsPage.js';
import { SpaceDetailsPage } from '../../pages/SpaceDetailsPage.js';
import { futureBookingDate } from '../../data/factories.js';
import { TIMEZONE } from '../../../shared/contracts.js';

test('UI-06: signed-in customer creates a booking with correct details', async ({ page, testDataManager }) => {
  const { customer, space } = testDataManager;
  const date = futureBookingDate();
  const expectedDate = DateTime.fromISO(date, { zone: TIMEZONE })
    .setLocale('en-GB')
    .toLocaleString({ day: 'numeric', month: 'long', year: 'numeric' });

  const spaceDetails = new SpaceDetailsPage(page, space.name, customer.fullName, customer.email);
  await spaceDetails.goto(space.id);
  await expect(spaceDetails.heading).toBeVisible();
  await expect(spaceDetails.mainNavigation.getByText(customer.fullName, { exact: true })).toBeVisible();
  await expect(spaceDetails.bookingIdentity).toBeVisible();

  await spaceDetails.chooseBooking(date, 2);
  const startTime = spaceDetails.startTimeButton('10:00');
  await expect(startTime).toBeEnabled();
  await spaceDetails.selectStartTime('10:00');

  await expect(spaceDetails.totalPrice.getByText('€80', { exact: true })).toBeVisible();
  await spaceDetails.confirmBooking();

  const bookingDetails = new BookingDetailsPage(page);
  await expect(bookingDetails.heading).toBeVisible();
  await expect(bookingDetails.reference).toHaveText(/^SB-[A-F0-9]{14}$/);
  const bookingReference = await bookingDetails.reference.innerText();
  await expect(bookingDetails.date).toHaveText(expectedDate);
  await expect(bookingDetails.time).toHaveText('10:00–12:00');
  await expect(bookingDetails.timezone).toHaveText(TIMEZONE);
  await expect(bookingDetails.duration).toHaveText('2 hours');
  await expect(bookingDetails.customerName).toHaveText(customer.fullName);
  await expect(bookingDetails.customerEmail).toHaveText(customer.email);
  await expect(bookingDetails.status).toBeVisible();
  await expect(bookingDetails.total).toHaveText('€80');

  await expect(page).toHaveURL(/\/bookings\/[^/?#]+$/);
  const bookingUrl = page.url();

  await bookingDetails.reload();

  await expect(page).toHaveURL(bookingUrl);
  await expect(bookingDetails.heading).toBeVisible();
  await expect(bookingDetails.reference).toHaveText(bookingReference);
  await expect(bookingDetails.date).toHaveText(expectedDate);
  await expect(bookingDetails.time).toHaveText('10:00–12:00');
  await expect(bookingDetails.timezone).toHaveText(TIMEZONE);
  await expect(bookingDetails.duration).toHaveText('2 hours');
  await expect(bookingDetails.customerName).toHaveText(customer.fullName);
  await expect(bookingDetails.customerEmail).toHaveText(customer.email);
  await expect(bookingDetails.status).toBeVisible();
  await expect(bookingDetails.total).toHaveText('€80');
});
