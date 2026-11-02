import { test as authTest } from './auth-fixtures.js';
import { RecoveryFlow } from '../flows/RecoveryFlow.js';
import type { TestAccount } from '../support/TestDataManager.js';

type Fixtures = {
  recoveryFlow: RecoveryFlow;
  competingAccount: TestAccount;
};

export const test = authTest.extend<Fixtures>({
  recoveryFlow: async ({ page, account, bookingFlow, testDataManager, myBookingsFlow }, use) => {
    await use(new RecoveryFlow(page, account, bookingFlow, testDataManager, myBookingsFlow));
  },
  competingAccount: async ({ testDataManager }, use) => {
    await use(await testDataManager.createAccount());
  }
});
