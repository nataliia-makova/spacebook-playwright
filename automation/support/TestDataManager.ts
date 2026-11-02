import type { APIRequestContext, BrowserContextOptions } from '@playwright/test';
import type { Booking, Space, SpaceInput, User } from '../../shared/contracts.js';
import { AuthApi } from '../api/AuthApi.js';
import { TestSupportApi } from '../api/TestSupportApi.js';
import { createSpaceInput, createUserInput, type SignupInput } from '../data/factories.js';

type StorageState = Exclude<NonNullable<BrowserContextOptions['storageState']>, string>;
type APIRequestFactory = {
  newContext(options: { baseURL: string; storageState: StorageState }): Promise<APIRequestContext>;
};
type TestAccount = {
  user: User;
  request: APIRequestContext;
  authApi: AuthApi;
  storageState: StorageState;
};
type TrackedAccount = Omit<TestAccount, 'storageState'> & {
  storageState?: StorageState;
};

export class TestDataManager {
  private readonly accounts = new Map<string, TrackedAccount>();
  private readonly spaces = new Map<string, Space>();
  private readonly bookings = new Map<string, Booking>();
  private readonly accountRequests = new Set<APIRequestContext>();
  private supportRequest: APIRequestContext | undefined;
  private testSupportApi: TestSupportApi | undefined;

  constructor(
    private readonly requestFactory: APIRequestFactory,
    private readonly baseURL: string,
    private readonly appOrigin: string
  ) {}

  get primaryAccount(): TestAccount {
    const account = this.accounts.values().next().value;
    if (!account?.storageState) {
      throw new Error('The primary test account has not been created.');
    }
    return { ...account, storageState: account.storageState };
  }

  get customer(): User {
    return this.primaryAccount.user;
  }

  get space(): Space {
    const space = this.spaces.values().next().value;
    if (!space) throw new Error('The test space has not been created.');
    return space;
  }

  get storageState(): StorageState {
    return this.primaryAccount.storageState;
  }

  async ensurePrimaryAccount(): Promise<TestAccount> {
    const account = this.accounts.values().next().value;
    return account?.storageState ? { ...account, storageState: account.storageState } : this.createAccount();
  }

  async createAccount(input: SignupInput = createUserInput()): Promise<TestAccount> {
    const request = await this.requestFactory.newContext({
      baseURL: this.baseURL,
      storageState: { cookies: [], origins: [] }
    });
    this.accountRequests.add(request);
    const authApi = new AuthApi(request, this.appOrigin);
    const user = await authApi.signup(input);
    const account: TrackedAccount = { user, request, authApi };
    this.accounts.set(user.id, account);

    const storageState = await request.storageState();
    account.storageState = storageState;
    return { ...account, storageState };
  }

  async createSpace(input: SpaceInput = createSpaceInput()): Promise<Space> {
    const supportApi = await this.getTestSupportApi();
    const space = await supportApi.createSpace(input);
    this.spaces.set(space.id, space);
    return space;
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

    for (const account of this.accounts.values()) {
      await attempt(`Discovering bookings for ${account.user.email}`, async () => {
        for (const booking of await account.authApi.listBookings()) {
          if (booking.customerEmail === account.user.email) {
            this.bookings.set(booking.id, booking);
          }
        }
      });
    }

    for (const booking of this.bookings.values()) {
      await attempt(`Deleting booking ${booking.reference}`, async () => {
        const supportApi = await this.getTestSupportApi();
        await supportApi.deleteBooking(booking.id);
      });
    }
    for (const space of this.spaces.values()) {
      await attempt(`Deleting space ${space.id}`, async () => {
        const supportApi = await this.getTestSupportApi();
        await supportApi.deleteSpace(space.id);
      });
    }
    for (const account of this.accounts.values()) {
      await attempt(`Deleting account ${account.user.id}`, async () => {
        const supportApi = await this.getTestSupportApi();
        await supportApi.deleteUser(account.user.id);
      });
    }

    for (const request of this.accountRequests) {
      await attempt('Disposing an account API context', () => request.dispose());
    }
    if (this.supportRequest) {
      const request = this.supportRequest;
      await attempt('Disposing the test-support API context', () => request.dispose());
    }

    if (errors.length) {
      throw new AggregateError(errors, 'Test data cleanup failed.');
    }
  }

  private async getTestSupportApi(): Promise<TestSupportApi> {
    if (!this.testSupportApi) {
      const request = await this.requestFactory.newContext({
        baseURL: this.baseURL,
        storageState: { cookies: [], origins: [] }
      });
      this.supportRequest = request;
      this.testSupportApi = new TestSupportApi(request);
    }
    return this.testSupportApi;
  }
}
