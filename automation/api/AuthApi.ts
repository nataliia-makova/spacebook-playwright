import type { APIRequestContext } from '@playwright/test';
import type { Booking, User } from '../../shared/contracts.js';
import type { SignupInput } from '../data/factories.js';
import { expectApiStatus } from './response.js';

export class AuthApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly origin: string
  ) {}

  async signup(input: SignupInput): Promise<User> {
    const response = await this.request.post('/api/auth/signup', {
      headers: { Origin: this.origin },
      data: input
    });
    await expectApiStatus(response, 201, 'Creating the test account');
    const body = await response.json() as { user: User };
    return body.user;
  }

  async signin(input: Pick<SignupInput, 'email' | 'password'>): Promise<User | undefined> {
    const response = await this.request.post('/api/auth/signin', {
      headers: { Origin: this.origin },
      data: { email: input.email, password: input.password }
    });
    if (response.status() === 401) return undefined;
    await expectApiStatus(response, 200, 'Signing in to discover test account data');
    const body = await response.json() as { user: User };
    return body.user;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.request.get('/api/auth/me');
    await expectApiStatus(response, 200, 'Reading the authenticated browser customer');
    const body = await response.json() as { user: User };
    if (!body.user || typeof body.user.id !== 'string') {
      throw new Error('The authenticated customer response is invalid.');
    }
    return body.user;
  }

  async listBookings(): Promise<Booking[]> {
    const response = await this.request.get('/api/me/bookings');
    await expectApiStatus(response, 200, 'Listing bookings for the test account');
    const body = await response.json() as { bookings: Booking[] };
    if (!Array.isArray(body.bookings)) {
      throw new Error('Listing bookings for the test account returned an invalid response.');
    }
    return body.bookings;
  }
}
