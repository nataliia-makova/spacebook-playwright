import { test } from '../../fixtures/api-fixtures.js';

test('API-01: simultaneous bookings for the same slot return one conflict', async ({ apiBookingFlow, twoCustomerScenario }) => {
  await apiBookingFlow.verifyConcurrentBookingConflict(twoCustomerScenario);
});

test('API-02: adjacent bookings on the same date are both permitted', async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.verifyAdjacentBookings(singleBookingScenario);
});

test('API-03: retrying an identical booking with the same key is idempotent', async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.verifyIdempotentRetry(singleBookingScenario);
});

test('API-04: reusing an idempotency key with a different payload is rejected', async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.verifyKeyReuseRejected(singleBookingScenario);
});

test('API-05: customers cannot access or replay another customer’s booking', async ({ apiBookingFlow, twoCustomerScenario }) => {
  await apiBookingFlow.verifyBookingOwnership(twoCustomerScenario);
});

test('API-06: unauthenticated guests cannot create bookings', async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.verifyGuestBookingRejected(singleBookingScenario);
  await apiBookingFlow.verifyCustomerCanBookSameSlot(singleBookingScenario);
});
