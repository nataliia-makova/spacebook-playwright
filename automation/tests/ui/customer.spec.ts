import { test } from '../../fixtures/auth-fixtures.js';

test('UI-06: signed-in customer creates a booking with correct details', async ({ bookingFlow, bookingScenario }) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await bookingFlow.verifyBookingPrice(bookingScenario);
  await bookingFlow.confirmBookingAndVerifyPersistence(bookingScenario);
});

test('UI-07: My Bookings shows only the signed-in customer’s bookings', async ({accountFlow, bookingOwnershipScenario}) => {
  await accountFlow.verifyBookingOwnershipAndGroups(
    bookingOwnershipScenario.confirmedBooking,
    bookingOwnershipScenario.cancelledBooking,
    bookingOwnershipScenario.otherAccountBooking
  );
});

test('UI-08: customer can dismiss cancellation and release a booking slot', async ({account, accountFlow, privateBooking}) => {
  await accountFlow.cancelBookingAndVerifyAvailability(privateBooking, account);
});

test('UI-09: signed-out customer cannot access private booking pages', async ({account, accountFlow,privateBooking}) => {
  await accountFlow.signOutAndVerifyPrivateBookingProtection(privateBooking, account.user);
});
