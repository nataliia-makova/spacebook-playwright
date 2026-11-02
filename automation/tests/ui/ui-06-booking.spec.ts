import { test } from '../../fixtures/auth-fixtures.js';

test('UI-06: signed-in customer creates a booking with correct details', async ({ bookingFlow, bookingScenario }) => {
  await bookingFlow.openSpace(bookingScenario);
  await bookingFlow.selectAvailableSlot(bookingScenario);
  await bookingFlow.verifyBookingPrice(bookingScenario);
  await bookingFlow.confirmBookingAndVerifyPersistence(bookingScenario);
});
