import { test } from '../../fixtures/journey-fixtures.js';

test('E2E-01: customer signs up, books and cancels a space', async ({
  accountFlow,
  signupCredentials,
  bookingFlow,
  bookingJourneyFlow,
  myBookingsFlow,
  bookingJourneyScenario
}) => {
  await accountFlow.signUp(signupCredentials);
  await bookingJourneyFlow.verifyAuthenticatedCustomer(bookingJourneyScenario);

  await bookingFlow.openSpace(bookingJourneyScenario);
  await bookingFlow.selectAvailableSlot(bookingJourneyScenario);
  await bookingFlow.verifyBookingPrice(bookingJourneyScenario);
  await bookingFlow.confirmBooking(bookingJourneyScenario);
  await bookingFlow.verifyBookingDetails(bookingJourneyScenario);

  await bookingJourneyFlow.verifyConfirmedBookingInApi(bookingJourneyScenario);
  await bookingFlow.verifyBookingMatchesApi(bookingJourneyScenario.booking);
  await bookingJourneyFlow.verifyConfirmedBookingInDatabase(bookingJourneyScenario);

  await myBookingsFlow.openMyBookings();
  await myBookingsFlow.verifyBookingConfirmed(bookingJourneyScenario.booking);
  await myBookingsFlow.verifyGroupCounts({ Upcoming: 1, Cancelled: 0 });
  await myBookingsFlow.requestCancellation(bookingJourneyScenario.booking);
  await myBookingsFlow.confirmCancellation();
  await myBookingsFlow.verifyBookingCancelled(bookingJourneyScenario.booking);

  await bookingJourneyFlow.verifyCancelledBookingInApi(bookingJourneyScenario);
  await bookingJourneyFlow.verifyCancelledBookingInDatabase(bookingJourneyScenario);
  await myBookingsFlow.verifyGroupCounts({ Upcoming: 0, Cancelled: 1 });
  await myBookingsFlow.reloadPage();
  await myBookingsFlow.verifyBookingCancelled(bookingJourneyScenario.booking);
  await myBookingsFlow.verifyGroupCounts({ Upcoming: 0, Cancelled: 1 });
  await myBookingsFlow.verifyTimeSlotAvailable(bookingJourneyScenario.booking);

  await myBookingsFlow.openBookingDetails(bookingJourneyScenario.booking);
  await bookingFlow.verifyCancelledBookingDetails(bookingJourneyScenario.booking);
});
