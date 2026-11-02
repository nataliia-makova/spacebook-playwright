import { test } from '../../fixtures/auth-fixtures.js';

test('UI-09: signed-out customer cannot access private booking pages', async ({
  account,
  accountFlow,
  privateBooking
}) => {
  const privateBookingPath = await accountFlow.openOwnedBooking(privateBooking);
  await accountFlow.signOutAndVerifyGuestNavigation();
  await accountFlow.verifyPrivatePagesRequireSignIn(privateBookingPath, privateBooking, account.user);
});
