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
