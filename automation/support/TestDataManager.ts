import type { APIRequestContext, BrowserContextOptions } from '@playwright/test';
import type { Booking, Space, User } from '../../shared/contracts.js';
import { AuthApi } from '../api/AuthApi.js';
import { TestSupportApi } from '../api/TestSupportApi.js';
import { createSpaceInput, createUserInput } from '../data/factories.js';

type StorageState = Exclude<NonNullable<BrowserContextOptions['storageState']>, string>;

export class TestDataManager {
  private readonly users = new Map<string, User>();
  private readonly spaces = new Map<string, Space>();
  private readonly bookings = new Map<string, Booking>();
  private storageStateValue: StorageState | undefined;
  private readonly authApi: AuthApi;
  private readonly testSupportApi: TestSupportApi;

  constructor(
    private readonly request: APIRequestContext,
    origin: string
  ) {
    this.authApi = new AuthApi(request, origin);
    this.testSupportApi = new TestSupportApi(request);
  }

  get customer(): User {
    const customer = this.users.values().next().value;
    if (!customer) throw new Error('The test account has not been created.');
    return customer;
  }

  get space(): Space {
    const space = this.spaces.values().next().value;
    if (!space) throw new Error('The test space has not been created.');
    return space;
  }

  get storageState(): StorageState {
    if (!this.storageStateValue) throw new Error('The test account storage state is not available.');
    return this.storageStateValue;
  }

  async createScenario(): Promise<void> {
    const customer = await this.authApi.signup(createUserInput());
    this.users.set(customer.id, customer);
    this.storageStateValue = await this.request.storageState();

    const space = await this.testSupportApi.createSpace(createSpaceInput());
    this.spaces.set(space.id, space);
  }

  async cleanup(): Promise<void> {
    const errors: Error[] = [];
    const attempt = async (label: string, operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        errors.push(new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`));
      }
    };

    for (const user of this.users.values()) {
      await attempt(`Discovering bookings for ${user.email}`, async () => {
        const userBookings = await this.authApi.listBookings();
        const ownedSpaceIds = new Set(this.spaces.keys());
        for (const booking of userBookings) {
          if (ownedSpaceIds.has(booking.spaceId) && booking.customerEmail === user.email) {
            this.bookings.set(booking.id, booking);
          }
        }
      });
    }

    for (const booking of this.bookings.values()) {
      await attempt(`Deleting booking ${booking.reference}`, () =>
        this.testSupportApi.deleteBooking(booking.id));
    }
    for (const space of this.spaces.values()) {
      await attempt(`Deleting space ${space.id}`, () =>
        this.testSupportApi.deleteSpace(space.id));
    }
    for (const user of this.users.values()) {
      await attempt(`Deleting account ${user.id}`, () =>
        this.testSupportApi.deleteUser(user.id));
    }

    if (errors.length) {
      throw new AggregateError(errors, 'Test data cleanup failed.');
    }
  }
}
