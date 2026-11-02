import { test } from '../../fixtures/guest-account-fixtures.js';

test('UI-01: guest filters spaces by type and capacity', async ({catalogFlow, catalogScenario}) => {
  await catalogFlow.filterByTypeAndCapacity(catalogScenario);
});

test('UI-02: customer signs up and stays authenticated after reload', async ({accountFlow, signupCredentials}) => {
  await accountFlow.signUp(signupCredentials);
  await accountFlow.reloadAndVerifySession(signupCredentials.fullName);
  await accountFlow.openMyBookingsAndVerifyEmpty();
});

test('UI-03: signup rejects a mismatched password confirmation', async ({accountFlow, request, signupCredentials}) => {
  await accountFlow.rejectMismatchedSignup(signupCredentials, request);
});

test('UI-04: signin rejects an incorrect password without granting private access', async ({accountFlow, apiAccount}) => {
  await accountFlow.rejectIncorrectPassword(
    apiAccount.credentials.email,
    `${apiAccount.credentials.password}-incorrect`
  );
});

test('UI-05: guest booking selection survives signin without auto-booking', async ({apiAccount, guestBookingFlow, guestBookingScenario}) => {
  await guestBookingFlow.selectBookingAndOpenSignin(guestBookingScenario);
  await guestBookingFlow.signInAndVerifySelection(guestBookingScenario, apiAccount);
});
