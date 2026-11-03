import type { Booking } from '../../shared/contracts.js';
import { TIMEZONE } from '../../shared/contracts.js';
import { futureBookingDate } from '../data/factories.js';
import { BookingFlow } from '../flows/BookingFlow.js';
import {
  BookingJourneyFlow,
  type BookingJourneyScenario,
  type BookingJourneyState
} from '../flows/BookingJourneyFlow.js';
import { test as guestTest } from './guest-account-fixtures.js';

type Fixtures = {
  bookingFlow: BookingFlow;
  bookingJourneyFlow: BookingJourneyFlow;
  bookingJourneyScenario: BookingJourneyScenario;
};

export const test = guestTest.extend<Fixtures>({
  bookingFlow: async ({ page }, use) => {
    await use(new BookingFlow(page));
  },
  bookingJourneyFlow: async ({ page }, use) => {
    await use(new BookingJourneyFlow(page));
  },
  bookingJourneyScenario: async ({ testDataManager, signupCredentials }, use) => {
    const space = await testDataManager.createSpace();
    const state: BookingJourneyState = {};
    await use({
      customer: {
        fullName: signupCredentials.fullName,
        email: signupCredentials.email
      },
      space,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2,
      expectedTotalCents: space.hourlyRate * 2,
      timezone: TIMEZONE,
      state,
      get booking(): Booking {
        if (!state.confirmedBooking) {
          throw new Error('Verify the confirmed booking in the API before using its details.');
        }
        return state.confirmedBooking;
      }
    });
  }
});
