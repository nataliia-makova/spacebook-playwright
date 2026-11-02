import { test as guestTest, expect } from './guest-fixtures.js';
import { TestDataManager, type TestAccount } from '../support/TestDataManager.js';
import { BookingFlow, type BookingScenario } from '../flows/BookingFlow.js';
import { AccountFlow } from '../flows/AccountFlow.js';
import type { Booking } from '../../shared/contracts.js';
import { futureBookingDate } from '../data/factories.js';
import { TIMEZONE } from '../../shared/contracts.js';

type Fixtures = {
  account: TestAccount;
  storageState: TestDataManager['storageState'];
  bookingFlow: BookingFlow;
  bookingScenario: BookingScenario;
  accountFlow: AccountFlow;
  privateBooking: Booking;
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
  }
});

export { expect };
