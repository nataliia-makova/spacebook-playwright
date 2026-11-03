import { test as authTest } from './auth-fixtures.js';
import { RecoveryFlow } from '../flows/RecoveryFlow.js';
import { AccountIsolationFlow, type AccountIsolationScenario } from '../flows/AccountIsolationFlow.js';
import type { TestAccount } from '../support/TestDataManager.js';
import type { Booking } from '../../shared/contracts.js';
import { futureBookingDate } from '../data/factories.js';

type Fixtures = {
  recoveryFlow: RecoveryFlow;
  competingAccount: TestAccount;
  accountIsolationFlow: AccountIsolationFlow;
  accountIsolationScenario: AccountIsolationScenario;
};

export const test = authTest.extend<Fixtures>({
  recoveryFlow: async ({ page, account, bookingFlow, testDataManager, myBookingsFlow }, use) => {
    const flow = new RecoveryFlow(page, account, bookingFlow, testDataManager, myBookingsFlow);
    try {
      await use(flow);
    } finally {
      await flow.cleanup();
    }
  },
  competingAccount: async ({ testDataManager }, use) => {
    await use(await testDataManager.createAccount());
  },
  accountIsolationFlow: async ({ page }, use) => {
    const flow = new AccountIsolationFlow(page);
    try {
      await use(flow);
    } finally {
      await flow.cleanup();
    }
  },
  accountIsolationScenario: async ({ account, testDataManager }, use) => {
    const customerB = await testDataManager.createAccount();
    const space = await testDataManager.createSpace();
    const booking: Booking = await testDataManager.createBooking(account, {
      spaceId: space.id,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2
    });
    await use({ customerA: account, customerB, booking });
  }
});
