import { TIMEZONE } from '../../shared/contracts.js';
import { futureBookingDate } from '../data/factories.js';
import { BookingFlow } from '../flows/BookingFlow.js';
import {
  BookingJourneyFlow,
  type BookingJourneyScenario
} from '../flows/BookingJourneyFlow.js';
import { test as guestTest } from './guest-account-fixtures.js';

type Fixtures = {
  bookingJourneyFlow: BookingJourneyFlow;
  bookingJourneyScenario: BookingJourneyScenario;
};

export const test = guestTest.extend<Fixtures>({
  bookingJourneyFlow: async ({ page, myBookingsFlow }, use) => {
    await use(new BookingJourneyFlow(page, new BookingFlow(page), myBookingsFlow));
  },
  bookingJourneyScenario: async ({ testDataManager }, use) => {
    const space = await testDataManager.createSpace();
    await use({
      space,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2,
      expectedTotalCents: space.hourlyRate * 2,
      timezone: TIMEZONE
    });
  }
});
