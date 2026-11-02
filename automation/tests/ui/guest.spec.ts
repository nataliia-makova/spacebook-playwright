import { test } from '../../fixtures/guest-account-fixtures.js';

test('UI-01: guest filters spaces by type and capacity', async ({ catalogFlow, catalogScenario }) => {
  await catalogFlow.openCatalog();
  await catalogFlow.filterSpaces(catalogScenario);
  await catalogFlow.verifyResults(catalogScenario);
});

test('UI-02: customer signs up and stays authenticated after reload', async ({ accountFlow, myBookingsFlow, signupCredentials }) => {
  await accountFlow.signUp(signupCredentials);
  await accountFlow.reloadPage();
  await accountFlow.verifySignedIn(signupCredentials.fullName);
  await myBookingsFlow.openMyBookings();
  await myBookingsFlow.verifyEmptyBookings();
});

test('UI-03: signup rejects a mismatched password confirmation', async ({ accountFlow, request, signupCredentials }) => {
  await accountFlow.submitMismatchedSignup(signupCredentials);
  await accountFlow.verifySignupRejected(signupCredentials);
  await accountFlow.verifyAccountNotCreated(signupCredentials, request);
});

test('UI-04: signin rejects an incorrect password without granting private access', async ({ accountFlow, apiAccount }) => {
  await accountFlow.signInWithWrongPassword(apiAccount.credentials);
  await accountFlow.verifySignInRejected(apiAccount.credentials.email);
  await accountFlow.verifySignInRequired();
});

test('UI-05: guest booking selection survives signin without auto-booking', async ({ accountFlow, apiAccount, guestBookingFlow, guestBookingScenario }) => {
  await guestBookingFlow.openSpace(guestBookingScenario);
  await guestBookingFlow.selectBooking(guestBookingScenario);
  await guestBookingFlow.chooseSignInToBook(guestBookingScenario);
  await accountFlow.signIn(apiAccount.credentials);
  await guestBookingFlow.verifySelectionPreserved(guestBookingScenario, apiAccount);
  await guestBookingFlow.verifyNoBookingCreated(guestBookingScenario, apiAccount);
});
