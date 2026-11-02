import { test as guestTest, expect } from './guest-fixtures.js';
import { TestDataManager, type TestAccount } from '../support/TestDataManager.js';
import { BookingFlow, type BookingScenario } from '../flows/BookingFlow.js';
import { AccountFlow } from '../flows/AccountFlow.js';
import type { Booking } from '../../shared/contracts.js';
import { createSpaceInput, futureBookingDate } from '../data/factories.js';
import { TIMEZONE } from '../../shared/contracts.js';

export type BookingOwnershipScenario = {
  confirmedBooking: Booking;
  cancelledBooking: Booking;
  otherAccountBooking: Booking;
};

type Fixtures = {
  account: TestAccount;
  storageState: TestDataManager['storageState'];
  bookingFlow: BookingFlow;
  bookingScenario: BookingScenario;
  accountFlow: AccountFlow;
  privateBooking: Booking;
  bookingOwnershipScenario: BookingOwnershipScenario;
};

export const test = guestTest.extend<Fixtures>({
  account: async ({ testDataManager }, use) => {
    const account = await testDataManager.ensurePrimaryAccount();
    await use(account);
  },
  storageState: async ({ account }, use) => {
    await use(account.storageState);
  },
  bookingFlow: async ({ page }, use) => {
    await use(new BookingFlow(page));
  },
  bookingScenario: async ({ account, testDataManager }, use) => {
    const space = await testDataManager.createSpace();

    await use({
      customer: account.user,
      space,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2,
      expectedTotalCents: 8000,
      timezone: TIMEZONE
    });
  },
  accountFlow: async ({ page }, use) => {
    await use(new AccountFlow(page));
  },
  privateBooking: async ({ account, testDataManager }, use) => {
    const space = await testDataManager.createSpace();
    const booking = await testDataManager.createBooking(account, {
      spaceId: space.id,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2
    });
    await use(booking);
  },
  bookingOwnershipScenario: async ({ account, testDataManager }, use) => {
    const otherAccount = await testDataManager.createAccount();
    const confirmedSpace = await testDataManager.createSpace(createSpaceInput());
    const cancelledSpace = await testDataManager.createSpace(createSpaceInput());
    const otherAccountSpace = await testDataManager.createSpace(createSpaceInput());
    const date = futureBookingDate();
    const confirmedBooking = await testDataManager.createBooking(account, {
      spaceId: confirmedSpace.id,
      date,
      startTime: '10:00',
      durationHours: 2
    });
    const bookingToCancel = await testDataManager.createBooking(account, {
      spaceId: cancelledSpace.id,
      date,
      startTime: '13:00',
      durationHours: 1
    });
    const cancelledBooking = await testDataManager.cancelBooking(account, bookingToCancel);
    const otherAccountBooking = await testDataManager.createBooking(otherAccount, {
      spaceId: otherAccountSpace.id,
      date,
      startTime: '10:00',
      durationHours: 2
    });
    await use({ confirmedBooking, cancelledBooking, otherAccountBooking });
  }
});

export { expect };
