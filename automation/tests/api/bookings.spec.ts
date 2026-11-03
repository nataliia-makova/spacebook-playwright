import { test } from '../../fixtures/api-fixtures.js';

test('API-01: simultaneous bookings for the same slot return one conflict', { tag: '@pr' }, async ({ apiBookingFlow, twoCustomerScenario }) => {
  await apiBookingFlow.submitConcurrentBookings(twoCustomerScenario);
  await apiBookingFlow.verifyOneBookingAccepted(twoCustomerScenario);
  await apiBookingFlow.verifyConflictingBookingRejected();
  await apiBookingFlow.verifyOnlyWinningCustomerHasBooking(twoCustomerScenario);
});

test('API-02: adjacent bookings on the same date are both permitted', { tag: '@pr' }, async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.createBooking(singleBookingScenario);
  await apiBookingFlow.createAdjacentBooking(singleBookingScenario);
  await apiBookingFlow.verifyAdjacentBookingsPersisted(singleBookingScenario);
});

test('API-03: retrying an identical booking with the same key is idempotent', { tag: ['@pr', '@hourly'] }, async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.createBooking(singleBookingScenario);
  await apiBookingFlow.retryBookingWithSameKey(singleBookingScenario);
  await apiBookingFlow.verifySameBookingReturned();
  await apiBookingFlow.verifyOriginalBookingPersistedOnce(singleBookingScenario);
});

test('API-04: reusing an idempotency key with a different payload is rejected', { tag: '@pr' }, async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.createBooking(singleBookingScenario);
  await apiBookingFlow.retryWithChangedPayload(singleBookingScenario);
  await apiBookingFlow.verifyIdempotencyKeyReuseRejected();
  await apiBookingFlow.verifyOriginalBookingPersistedOnce(singleBookingScenario);
});

test('API-05: customers cannot access or replay another customer’s booking', { tag: ['@pr', '@security'] }, async ({ apiBookingFlow, twoCustomerScenario }) => {
  await apiBookingFlow.createBooking(twoCustomerScenario);
  await apiBookingFlow.verifyOtherCustomerCannotRead(twoCustomerScenario);
  await apiBookingFlow.verifyOtherCustomerCannotCancel(twoCustomerScenario);
  await apiBookingFlow.verifyOtherCustomerCannotReplay(twoCustomerScenario);
  await apiBookingFlow.verifyOwnerCanStillReadBooking(twoCustomerScenario);
  await apiBookingFlow.verifyOnlyOwnerHasBooking(twoCustomerScenario);
});

test('API-06: unauthenticated guests cannot create bookings', { tag: ['@pr', '@hourly', '@security'] }, async ({ apiBookingFlow, singleBookingScenario }) => {
  await apiBookingFlow.verifyGuestBookingRejected(singleBookingScenario);
  await apiBookingFlow.verifyCustomerCanBookSameSlot(singleBookingScenario);
});
