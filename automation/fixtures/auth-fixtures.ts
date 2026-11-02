import { test as guestTest, expect } from './guest-fixtures.js';
import { TestDataManager } from '../support/TestDataManager.js';

type Fixtures = {
  testDataManager: TestDataManager;
  storageState: TestDataManager['storageState'];
};

export const test = guestTest.extend<Fixtures>({
  testDataManager: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error('Authenticated UI tests require a configured baseURL.');
    const request = await playwright.request.newContext({ baseURL });
    const manager = new TestDataManager(request, new URL(baseURL).origin);
    const failures: Error[] = [];

    try {
      await manager.createScenario();
      await use(manager);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      await manager.cleanup();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      await request.dispose();
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
