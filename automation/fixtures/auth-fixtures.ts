import { test as guestTest, expect } from './guest-fixtures.js';
import { TestDataManager } from '../support/TestDataManager.js';

type Fixtures = {
  testDataManager: TestDataManager;
  storageState: TestDataManager['storageState'];
};

export const test = guestTest.extend<Fixtures>({
  testDataManager: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error('Authenticated UI tests require a configured baseURL.');
    const manager = new TestDataManager(playwright.request, baseURL, new URL(baseURL).origin);
    const failures: Error[] = [];

    try {
      await manager.createAccount();
      await manager.createSpace();
      await use(manager);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      await manager.cleanup();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Authenticated test setup or cleanup failed.');
    }
  },
  storageState: async ({ testDataManager }, use) => {
    await use(testDataManager.storageState);
  }
});

export { expect };
