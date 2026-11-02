import { test as signupTest } from '../../fixtures/signup-fixtures.js';
import { test as guestAccountTest } from '../../fixtures/guest-account-fixtures.js';

signupTest('UI-02: customer signs up and stays authenticated after reload', async ({
  accountFlow,
  signupCredentials
}) => {
  await accountFlow.signUp(signupCredentials);
  await accountFlow.reloadAndVerifySession(signupCredentials.fullName);
  await accountFlow.openMyBookingsAndVerifyEmpty();
});

signupTest('UI-03: signup rejects a mismatched password confirmation', async ({
  accountFlow,
  request,
  signupCredentials
}) => {
  await accountFlow.rejectMismatchedSignup(signupCredentials, request);
});

guestAccountTest('UI-04: signin rejects an incorrect password without granting private access', async ({
  accountFlow,
  apiAccount
}) => {
  await accountFlow.rejectIncorrectPassword(
    apiAccount.credentials.email,
    `${apiAccount.credentials.password}-incorrect`
  );
});
