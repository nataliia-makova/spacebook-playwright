import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { test as base, expect, type APIResponse, type BrowserContextOptions } from '@playwright/test';
import { TIMEZONE, type Booking, type OpeningHours, type Space, type User } from '../../shared/contracts.js';

type StorageState = Exclude<NonNullable<BrowserContextOptions['storageState']>, string>;

type Ui06Scenario = {
  customer: User;
  space: Space;
  storageState: StorageState;
};

type Fixtures = {
  ui06Scenario: Ui06Scenario;
};

async function expectStatus(
  response: APIResponse,
  status: number,
  action: string
): Promise<void> {
  if (response.status() !== status) {
    throw new Error(`${action} failed with status ${response.status()}: ${await response.text()}`);
  }
}

export const test = base.extend<Fixtures>({
  ui06Scenario: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error('UI-06 requires a configured baseURL.');
    const api = await playwright.request.newContext({ baseURL });
    const origin = new URL(baseURL).origin;
    let userId: string | undefined;
    let spaceId: string | undefined;

    try {
      const customerInput = {
        fullName: `UI-06 Customer ${randomUUID()}`,
        email: `ui06-${randomUUID()}@example.test`,
        password: `Ui06-${randomUUID()}`
      };
      const signup = await api.post('/api/auth/signup', {
        headers: { Origin: origin },
        data: customerInput
      });
      await expectStatus(signup, 201, 'Creating the UI-06 customer');
      const { user: customer } = await signup.json() as { user: User };
      userId = customer.id;

      const openingHours: OpeningHours = {
        '1': { opensAt: '09:00', closesAt: '20:00' },
        '2': { opensAt: '09:00', closesAt: '20:00' },
        '3': { opensAt: '09:00', closesAt: '20:00' },
        '4': { opensAt: '09:00', closesAt: '20:00' },
        '5': { opensAt: '09:00', closesAt: '20:00' },
        '6': { opensAt: '09:00', closesAt: '20:00' },
        '7': { opensAt: '09:00', closesAt: '20:00' }
      };
      const spaceResponse = await api.post('/api/test-support/spaces', {
        data: {
          name: `UI-06 Test Space ${randomUUID()}`,
          type: 'podcast-booth',
          capacity: 2,
          equipment: [],
          hourlyRate: 4000,
          openingHours
        }
      });
      await expectStatus(spaceResponse, 201, 'Creating the UI-06 test space');
      const { space } = await spaceResponse.json() as { space: Space };
      spaceId = space.id;

      await use({
        customer,
        space,
        storageState: await api.storageState()
      });
    } finally {
      const cleanupErrors: Error[] = [];
      const attempt = async (label: string, operation: () => Promise<void>) => {
        try {
          await operation();
        } catch (error) {
          cleanupErrors.push(new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`));
        }
      };

      if (userId) {
        let bookings: Booking[] = [];
        await attempt('Listing UI-06 bookings for cleanup', async () => {
          const response = await api.get('/api/me/bookings');
          await expectStatus(response, 200, 'Listing UI-06 bookings for cleanup');
          ({ bookings } = await response.json() as { bookings: Booking[] });
        });
        for (const booking of bookings) {
          await attempt(`Deleting UI-06 booking ${booking.reference}`, async () => {
            const deletion = await api.delete(`/api/test-support/bookings/${booking.id}`);
            await expectStatus(deletion, 204, `Deleting UI-06 booking ${booking.reference}`);
          });
        }
        await attempt('Deleting the UI-06 customer', async () => {
          const response = await api.delete(`/api/test-support/users/${userId}`);
          await expectStatus(response, 204, 'Deleting the UI-06 customer');
        });
      }

      if (spaceId) {
        await attempt('Deleting the UI-06 test space', async () => {
          const response = await api.delete(`/api/test-support/spaces/${spaceId}`);
          await expectStatus(response, 204, 'Deleting the UI-06 test space');
        });
      }

      await api.dispose();
      if (cleanupErrors.length) {
        throw new AggregateError(cleanupErrors, 'UI-06 test data cleanup failed.');
      }
    }
  }
});

export { expect };

export function futureBookingDate(): string {
  return DateTime.now().setZone(TIMEZONE).plus({ days: 7 }).toISODate()!;
}
