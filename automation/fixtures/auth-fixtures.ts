import { test as guestTest, expect } from './guest-fixtures.js';
import { TestDataManager } from '../support/TestDataManager.js';

type Fixtures = {
  storageState: TestDataManager['storageState'];
};

export const test = guestTest.extend<Fixtures>({
  storageState: async ({ testDataManager }, use) => {
    const account = await testDataManager.ensurePrimaryAccount();
    await use(account.storageState);
  }
});

export { expect };
