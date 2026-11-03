import { test as base, expect } from '@playwright/test';
import { TestDataManager } from '../support/TestDataManager.js';
import { APP_ORIGIN } from '../support/testConfig.js';

type Fixtures = {
  testDataManager: TestDataManager;
};

export const test = base.extend<Fixtures>({
  testDataManager: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error('Tests using TestDataManager require a configured baseURL.');
    const manager = new TestDataManager(playwright.request, baseURL, APP_ORIGIN);
    const failures: Error[] = [];

    try {
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
      throw new AggregateError(failures, 'Test execution or test data cleanup failed.');
    }
  }
});

export { expect };
