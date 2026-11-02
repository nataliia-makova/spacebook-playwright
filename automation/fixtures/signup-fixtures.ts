import { test as guestTest } from './guest-fixtures.js';
import { AccountFlow } from '../flows/AccountFlow.js';
import { createUserInput, type SignupInput } from '../data/factories.js';

type Fixtures = {
  accountFlow: AccountFlow;
  signupCredentials: SignupInput;
};

export const test = guestTest.extend<Fixtures>({
  accountFlow: async ({ page }, use) => {
    await use(new AccountFlow(page));
  },
  signupCredentials: async ({ testDataManager }, use) => {
    const credentials = createUserInput();
    testDataManager.trackAccountSignup(credentials);
    await use(credentials);
  }
});
