import { test } from '../../fixtures/auth-fixtures.js';

test('UI-06: signed-in customer creates a booking with correct details', async ({ bookingFlow, bookingScenario }) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await bookingFlow.verifyBookingPrice(bookingScenario);
  await bookingFlow.confirmBooking(bookingScenario);
  await bookingFlow.verifyBookingDetails(bookingScenario);
  await bookingFlow.reloadPage();
  await bookingFlow.verifyBookingDetails(bookingScenario);
});

test('UI-07: My Bookings shows only the signed-in customer’s bookings', async ({ myBookingsFlow, bookingOwnershipScenario }) => {
  await myBookingsFlow.openMyBookings();
  await myBookingsFlow.verifyBookingInGroup(bookingOwnershipScenario.confirmedBooking, 'Upcoming');
  await myBookingsFlow.verifyBookingInGroup(bookingOwnershipScenario.cancelledBooking, 'Cancelled');
  await myBookingsFlow.verifyBookingNotListed(bookingOwnershipScenario.otherAccountBooking);
  await myBookingsFlow.verifyGroupCounts({
    Upcoming: 1,
    Cancelled: 1
  });
});

test('UI-08: customer can dismiss cancellation and release a booking slot', async ({ account, myBookingsFlow, privateBooking }) => {
  await myBookingsFlow.openMyBookings();
  await myBookingsFlow.verifyBookingConfirmed(privateBooking);
  await myBookingsFlow.requestCancellation(privateBooking);
  await myBookingsFlow.keepBooking();
  await myBookingsFlow.verifyBookingConfirmed(privateBooking);
  await myBookingsFlow.requestCancellation(privateBooking);
  await myBookingsFlow.confirmCancellation();
  await myBookingsFlow.verifyBookingCancelled(privateBooking);
  await myBookingsFlow.reloadPage();
  await myBookingsFlow.verifyBookingCancelled(privateBooking);
  await myBookingsFlow.verifyTimeSlotAvailable(privateBooking, account);
});

test('UI-09: signed-out customer cannot access private booking pages', async ({ account, accountFlow, privateBooking }) => {
  await accountFlow.openBookingDetails(privateBooking);
  await accountFlow.verifyBookingDetails(privateBooking);
  await accountFlow.signOut();
  await accountFlow.verifyGuestNavigation();
  await accountFlow.verifyPrivatePagesRequireSignIn(privateBooking, account.user);
});
