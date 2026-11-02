import type { APIRequestContext, BrowserContextOptions } from '@playwright/test';
import type { Booking, Space, SpaceInput, User } from '../../shared/contracts.js';
import { signupSchema } from '../../shared/contracts.js';
import { AuthApi } from '../api/AuthApi.js';
import { TestSupportApi } from '../api/TestSupportApi.js';
import { createSpaceInput, createUserInput, type SignupInput } from '../data/factories.js';

type StorageState = Exclude<NonNullable<BrowserContextOptions['storageState']>, string>;
type APIRequestFactory = {
  newContext(options: { baseURL: string; storageState: StorageState }): Promise<APIRequestContext>;
};
export type TestAccount = {
  user: User;
  request: APIRequestContext;
  authApi: AuthApi;
  storageState: StorageState;
  credentials: SignupInput;
};
type TrackedAccount = {
  credentials: SignupInput;
  user?: User;
  request?: APIRequestContext;
  authApi?: AuthApi;
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
    const account = [...this.accounts.values()]
      .map(value => this.asTestAccount(value))
      .find((value): value is TestAccount => value !== undefined);
    if (!account) {
      throw new Error('The primary test account has not been created.');
    }
    return account;
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
    const account = [...this.accounts.values()]
      .map(value => this.asTestAccount(value))
      .find((value): value is TestAccount => value !== undefined);
    return account ?? this.createAccount();
  }

  async createAccount(input: SignupInput = createUserInput()): Promise<TestAccount> {
    const trackedAccount = this.trackAccountSignupRecord(input);
    const request = await this.requestFactory.newContext({
      baseURL: this.baseURL,
      storageState: { cookies: [], origins: [] }
    });
    this.accountRequests.add(request);
    const authApi = new AuthApi(request, this.appOrigin);
    const user = await authApi.signup(input);
    if (!trackedAccount) {
      throw new Error('A successfully created test account had invalid signup data.');
    }
    trackedAccount.user = user;
    trackedAccount.request = request;
    trackedAccount.authApi = authApi;

    const storageState = await request.storageState();
    trackedAccount.storageState = storageState;
    const account = this.asTestAccount(trackedAccount);
    if (!account) throw new Error('The created test account could not be returned.');
    return account;
  }

  trackAccountSignup(input: SignupInput): void {
    this.trackAccountSignupRecord(input);
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
      await attempt(`Discovering bookings for ${account.credentials.email}`, async () => {
        const request = await this.requestFactory.newContext({
          baseURL: this.baseURL,
          storageState: { cookies: [], origins: [] }
        });
        this.accountRequests.add(request);
        const authApi = new AuthApi(request, this.appOrigin);
        const user = await authApi.signin(account.credentials);
        if (!user) {
          if (account.user) {
            throw new Error(`Could not sign in to discover bookings for ${account.user.email}.`);
          }
          return;
        }
        if (account.user && user.id !== account.user.id) {
          throw new Error(`The signup credentials resolved to an unexpected account for ${account.credentials.email}.`);
        }
        account.user = user;
        for (const booking of await authApi.listBookings()) {
          if (booking.customerEmail === user.email) {
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
      const user = account.user;
      if (!user) continue;
      await attempt(`Deleting account ${user.id}`, async () => {
        const supportApi = await this.getTestSupportApi();
        await supportApi.deleteUser(user.id);
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

  private trackAccountSignupRecord(input: SignupInput): TrackedAccount | undefined {
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) return undefined;

    const email = parsed.data.email;
    const existing = this.accounts.get(email);
    if (existing) {
      if (existing.credentials.password !== parsed.data.password) {
        throw new Error(`Signup tracking already exists with different credentials for ${email}.`);
      }
      return existing;
    }
    const account: TrackedAccount = { credentials: parsed.data };
    this.accounts.set(email, account);
    return account;
  }

  private asTestAccount(account: TrackedAccount): TestAccount | undefined {
    if (!account.user || !account.request || !account.authApi || !account.storageState) {
      return undefined;
    }
    return {
      user: account.user,
      request: account.request,
      authApi: account.authApi,
      storageState: account.storageState,
      credentials: account.credentials
    };
  }
}
