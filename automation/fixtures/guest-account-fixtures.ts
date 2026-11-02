import { test as guestTest } from './guest-fixtures.js';
import { AccountFlow } from '../flows/AccountFlow.js';
import type { TestAccount } from '../support/TestDataManager.js';

type Fixtures = {
  accountFlow: AccountFlow;
  apiAccount: TestAccount;
};

export const test = guestTest.extend<Fixtures>({
  accountFlow: async ({ page }, use) => {
    await use(new AccountFlow(page));
  },
  apiAccount: async ({ testDataManager }, use) => {
    await use(await testDataManager.createAccount());
  }
});
