import { test } from '../../fixtures/signup-fixtures.js';

test('UI-02: customer signs up and stays authenticated after reload', async ({
  accountFlow,
  signupCredentials
}) => {
  await accountFlow.signUp(signupCredentials);
  await accountFlow.reloadAndVerifySession(signupCredentials.fullName);
  await accountFlow.openMyBookingsAndVerifyEmpty();
});
