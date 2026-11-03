import { test } from '../../fixtures/journey-fixtures.js';

test('E2E-01: customer signs up, books and cancels a space', async ({
  accountFlow,
  signupCredentials,
  bookingJourneyFlow,
  bookingJourneyScenario
}) => {
  await accountFlow.signUp(signupCredentials);
  await bookingJourneyFlow.verifyBookingLifecycle(bookingJourneyScenario, signupCredentials);
});
