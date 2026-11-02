import { DateTime } from 'luxon';
import { test, expect, futureBookingDate } from '../../fixtures/ui-fixtures.js';
import { TIMEZONE } from '../../../shared/contracts.js';

test('UI-06: signed-in customer creates a booking with correct details', async ({ page, ui06Scenario }) => {
  const { customer, space } = ui06Scenario;
  const date = futureBookingDate();
  const expectedDate = DateTime.fromISO(date, { zone: TIMEZONE })
    .setLocale('en-GB')
    .toLocaleString({ day: 'numeric', month: 'long', year: 'numeric' });

  await page.context().addCookies(ui06Scenario.storageState.cookies);
  await page.goto(`/spaces/${space.id}`);
  await expect(page.getByRole('heading', { name: space.name })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText(customer.fullName, { exact: true })).toBeVisible();
  await expect(page.getByText(`Booking for ${customer.fullName} (${customer.email})`)).toBeVisible();

  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Duration').selectOption('2');
  const startTime = page.getByRole('button', { name: '10:00 available' });
  await expect(startTime).toBeEnabled();
  await startTime.click();

  await expect(page.locator('.price-breakdown .total').getByText('€80', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  const reference = page.locator('.reference strong');
  await expect(reference).toHaveText(/^SB-[A-F0-9]{14}$/);
  const bookingReference = await reference.innerText();
  await expect(page.getByText(expectedDate, { exact: true })).toBeVisible();
  await expect(page.getByText('10:00–12:00', { exact: true })).toBeVisible();
  await expect(page.getByText(TIMEZONE, { exact: true })).toBeVisible();
  await expect(page.locator('.booking-facts').getByText(customer.fullName, { exact: true })).toBeVisible();
  await expect(page.locator('.booking-facts').getByText(customer.email, { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Confirmed$/ })).toBeVisible();
  await expect(page.getByText('€80', { exact: true })).toBeVisible();

  await expect(page).toHaveURL(/\/bookings\/[^/?#]+$/);
  const bookingUrl = page.url();

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(bookingUrl);
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  await expect(page.locator('.reference strong')).toHaveText(bookingReference);
  await expect(page.getByText(expectedDate, { exact: true })).toBeVisible();
  await expect(page.getByText('10:00–12:00', { exact: true })).toBeVisible();
  await expect(page.locator('.booking-facts').getByText(customer.fullName, { exact: true })).toBeVisible();
  await expect(page.locator('.booking-facts').getByText(customer.email, { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Confirmed$/ })).toBeVisible();
  await expect(page.getByText('€80', { exact: true })).toBeVisible();
});
