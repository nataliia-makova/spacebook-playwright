import { test } from '../../fixtures/recovery-fixtures.js';

test('MOCK-01: My Bookings recovers after a temporary server error', { tag: '@recovery' }, async ({recoveryFlow, myBookingsFlow, privateBooking}) => {
  await recoveryFlow.failNextBookingsRequest();
  await myBookingsFlow.openMyBookings();
  await recoveryFlow.verifyBookingsLoadFailed(privateBooking);
  await recoveryFlow.retryLoadingBookings();
  await myBookingsFlow.verifyBookingConfirmed(privateBooking);
  await recoveryFlow.verifyBookingUnchangedInApi(privateBooking);
});

test('MOCK-02: customer recovers when another customer takes the selected slot', { tag: '@recovery' }, async ({account, bookingFlow, bookingScenario, competingAccount, recoveryFlow}) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await recoveryFlow.bookSelectedSlotAsAnotherCustomer(bookingScenario, competingAccount);
  await recoveryFlow.attemptBooking(bookingScenario);
  await recoveryFlow.verifyBookingConflictResponse();
  await recoveryFlow.verifyConflictAndRefresh(bookingScenario);
  await recoveryFlow.selectAlternativeSlot(bookingScenario);
  await recoveryFlow.confirmAlternativeBooking();
  await recoveryFlow.verifyAlternativeBookingDetails();
  await recoveryFlow.verifySeparateBookings(bookingScenario, account, competingAccount);
});

test('MOCK-03: customer safely retries when the booking response is lost', { tag: '@recovery' }, async ({bookingFlow, bookingScenario, recoveryFlow}) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await bookingFlow.verifyBookingPrice(bookingScenario);
  await recoveryFlow.loseFirstBookingResponse();
  await recoveryFlow.submitBookingWithLostResponse(bookingScenario);
  await recoveryFlow.verifyUncertainBookingState(bookingScenario);
  await recoveryFlow.verifyOriginalBookingPersisted(bookingScenario);
  await recoveryFlow.retrySameBooking(bookingScenario);
  await recoveryFlow.verifyIdempotentRecovery();
  await recoveryFlow.verifyRecoveredBookingDetails(bookingScenario);
  await recoveryFlow.verifyOnlyOneBookingPersisted(bookingScenario);
  await recoveryFlow.verifyRetryStateCleared();
});

test('MOCK-04: switching accounts never reveals another customer’s bookings', { tag: '@security' }, async ({accountIsolationFlow, accountIsolationScenario}) => {
  await accountIsolationFlow.startDelayedBookingsRequest(accountIsolationScenario);
  await accountIsolationFlow.switchAccount(accountIsolationScenario);
  await accountIsolationFlow.releaseDelayedBookingsResponse();
  await accountIsolationFlow.verifyBrowserDataIsolated(accountIsolationScenario);
  await accountIsolationFlow.verifyApiDataIsolated();
});
