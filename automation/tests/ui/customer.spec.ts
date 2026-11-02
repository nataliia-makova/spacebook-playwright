import { test } from '../../fixtures/auth-fixtures.js';

test('UI-06: signed-in customer creates a booking with correct details', async ({ bookingFlow, bookingScenario }) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await bookingFlow.verifyBookingPrice(bookingScenario);
  await bookingFlow.confirmBookingAndVerifyPersistence(bookingScenario);
});

test('UI-09: signed-out customer cannot access private booking pages', async ({
  account,
  accountFlow,
  privateBooking
}) => {
  const privateBookingPath = await accountFlow.openOwnedBooking(privateBooking);
  await accountFlow.signOutAndVerifyGuestNavigation();
  await accountFlow.verifyPrivatePagesRequireSignIn(privateBookingPath, privateBooking, account.user);
});
