import type { BookingInput } from '../../shared/contracts.js';
import {
  ApiBookingFlow,
  type SingleBookingScenario,
  type TwoCustomerScenario
} from '../flows/ApiBookingFlow.js';
import { futureBookingDate } from '../data/factories.js';
import { APP_ORIGIN } from '../support/testConfig.js';
import { test as guestTest } from './guest-fixtures.js';

type Fixtures = {
  apiBookingFlow: ApiBookingFlow;
  singleBookingScenario: SingleBookingScenario;
  twoCustomerScenario: TwoCustomerScenario;
};

export const test = guestTest.extend<Fixtures>({
  apiBookingFlow: async ({ request }, use) => {
    await use(new ApiBookingFlow(request, APP_ORIGIN));
  },
  singleBookingScenario: async ({ testDataManager }, use) => {
    const customer = await testDataManager.createAccount();
    const space = await testDataManager.createSpace();
    const booking: BookingInput = {
      spaceId: space.id,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2
    };

    await use({ customer, space, booking });
  },
  twoCustomerScenario: async ({ testDataManager }, use) => {
    const firstCustomer = await testDataManager.createAccount();
    const secondCustomer = await testDataManager.createAccount();
    const space = await testDataManager.createSpace();
    const booking: BookingInput = {
      spaceId: space.id,
      date: futureBookingDate(),
      startTime: '10:00',
      durationHours: 2
    };

    await use({ firstCustomer, secondCustomer, space, booking });
  }
});
