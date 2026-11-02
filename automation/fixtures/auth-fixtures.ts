import { test as guestTest, expect } from './guest-fixtures.js';
import { TestDataManager } from '../support/TestDataManager.js';
import { BookingFlow, type BookingScenario } from '../flows/BookingFlow.js';
import { futureBookingDate } from '../data/factories.js';
import { TIMEZONE } from '../../shared/contracts.js';

type Fixtures = {
  storageState: TestDataManager['storageState'];
  bookingFlow: BookingFlow;
  bookingScenario: BookingScenario;
};

export const test = guestTest.extend<Fixtures>({
  storageState: async ({ testDataManager }, use) => {
    const account = await testDataManager.ensurePrimaryAccount();
    await use(account.storageState);
  },
  bookingFlow: async ({ page }, use) => {
    await use(new BookingFlow(page));
  },
  bookingScenario: async ({ testDataManager }, use) => {
    const account = await testDataManager.ensurePrimaryAccount();
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
  }
});

export { expect };
