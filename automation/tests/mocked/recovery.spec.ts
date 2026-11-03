import { test } from '../../fixtures/recovery-fixtures.js';

test('MOCK-01: My Bookings recovers after a temporary server error', { tag: '@recovery' }, async ({recoveryFlow, myBookingsFlow, privateBooking}) => {
  await recoveryFlow.failNextBookingsRequest();
  await myBookingsFlow.openMyBookings();
  await recoveryFlow.verifyBookingsLoadFailed(privateBooking);
  await recoveryFlow.retryLoadingBookings();
  await recoveryFlow.verifyBookingVisible(privateBooking);
});

test('MOCK-02: customer recovers when another customer takes the selected slot', { tag: '@recovery' }, async ({account, bookingFlow, bookingScenario, competingAccount, recoveryFlow}) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await recoveryFlow.bookSelectedSlotAsAnotherCustomer(bookingScenario, competingAccount);
  await recoveryFlow.attemptBooking();
  await recoveryFlow.verifyConflictAndRefresh(bookingScenario);
  await recoveryFlow.bookAlternativeSlot(bookingScenario);
  await recoveryFlow.verifySeparateBookings(bookingScenario, account, competingAccount);
});

test('MOCK-03: customer safely retries when the booking response is lost', { tag: '@recovery' }, async ({account, bookingFlow, bookingScenario, recoveryFlow}) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await bookingFlow.verifyBookingPrice(bookingScenario);
  await recoveryFlow.verifyRetryAfterLostResponse(bookingScenario, account);
});

test('MOCK-04: switching accounts never reveals another customer’s bookings', { tag: '@security' }, async ({accountIsolationFlow, accountIsolationScenario}) => {
  await accountIsolationFlow.startDelayedBookingsRequest(accountIsolationScenario);
  await accountIsolationFlow.switchAccount(accountIsolationScenario);
  await accountIsolationFlow.verifyBookingsIsolated(accountIsolationScenario);
});
