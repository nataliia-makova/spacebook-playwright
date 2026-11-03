import { test as guestTest } from './guest-fixtures.js';
import { AccountFlow } from '../flows/AccountFlow.js';
import { MyBookingsFlow } from '../flows/MyBookingsFlow.js';
import { GuestBookingFlow, type GuestBookingScenario } from '../flows/GuestBookingFlow.js';
import { SpaceCatalogFlow, type CatalogScenario } from '../flows/SpaceCatalogFlow.js';
import { createSpaceInput, createUserInput, futureBookingDate, type SignupInput } from '../data/factories.js';
import type { TestAccount } from '../support/TestDataManager.js';

type Fixtures = {
  accountFlow: AccountFlow;
  myBookingsFlow: MyBookingsFlow;
  apiAccount: TestAccount;
  signupCredentials: SignupInput;
  catalogFlow: SpaceCatalogFlow;
  catalogScenario: CatalogScenario;
  guestBookingFlow: GuestBookingFlow;
  guestBookingScenario: GuestBookingScenario;
};

export const test = guestTest.extend<Fixtures>({
  accountFlow: async ({ page }, use) => {
    await use(new AccountFlow(page));
  },
  myBookingsFlow: async ({ page }, use) => {
    await use(new MyBookingsFlow(page));
  },
  apiAccount: async ({ testDataManager }, use) => {
    await use(await testDataManager.createAccount());
  },
  signupCredentials: async ({ testDataManager }, use) => {
    const credentials = createUserInput();
    testDataManager.trackAccountSignup(credentials);
    await use(credentials);
  },
  catalogFlow: async ({ page }, use) => {
    await use(new SpaceCatalogFlow(page));
  },
  catalogScenario: async ({ testDataManager }, use) => {
    const matchingSpace = await testDataManager.createSpace(
      createSpaceInput({ type: 'podcast-booth', capacity: 6 })
    );
    const sameTypeButTooSmall = await testDataManager.createSpace(
      createSpaceInput({ type: 'podcast-booth', capacity: 2 })
    );
    const largeSpaceOfAnotherType = await testDataManager.createSpace(
      createSpaceInput({ type: 'rehearsal-room', capacity: 6 })
    );
    await use({
      matchingSpace,
      sameTypeButTooSmall,
      largeSpaceOfAnotherType,
      filterType: 'podcast-booth',
      minimumCapacity: 4
    });
  },
  guestBookingFlow: async ({ page }, use) => {
    await use(new GuestBookingFlow(page));
  },
  guestBookingScenario: async ({ testDataManager }, use) => {
    const space = await testDataManager.createSpace(createSpaceInput({
      type: 'podcast-booth',
      capacity: 2
    }));
    const scenario: GuestBookingScenario = {
      space,
      date: futureBookingDate(),
      durationHours: 2,
      startTime: '10:00'
    };
    await use(scenario);
  }
});
