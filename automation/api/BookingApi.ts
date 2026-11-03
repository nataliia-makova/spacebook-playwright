import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Booking, BookingInput } from '../../shared/contracts.js';
import { expectApiStatus } from './response.js';

export class BookingApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly origin: string
  ) {}

  async create(input: BookingInput): Promise<Booking> {
    const response = await this.submit(input, randomUUID());
    await expectApiStatus(response, 201, 'Creating the test booking');
    const body = await response.json() as { booking: Booking };
    if (!body.booking || typeof body.booking.id !== 'string') {
      throw new Error('Creating the test booking returned an invalid response.');
    }
    return body.booking;
  }

  async submit(input: BookingInput, idempotencyKey: string): Promise<APIResponse> {
    return this.request.post('/api/bookings', {
      headers: {
        Origin: this.origin,
        'Idempotency-Key': idempotencyKey
      },
      data: input
    });
  }

  async getByConfirmation(booking: Booking): Promise<APIResponse> {
    return this.request.get(`/api/bookings/${this.confirmationToken(booking)}`);
  }

  async cancelRequest(booking: Booking): Promise<APIResponse> {
    return this.request.post(`/api/bookings/${this.confirmationToken(booking)}/cancel`, {
      headers: { Origin: this.origin }
    });
  }

  async cancel(booking: Booking): Promise<Booking> {
    const response = await this.cancelRequest(booking);
    await expectApiStatus(response, 200, `Cancelling test booking ${booking.reference}`);
    const body = await response.json() as { booking: Booking };
    if (body.booking?.id !== booking.id || body.booking.status !== 'cancelled') {
      throw new Error(`Cancelling test booking ${booking.reference} returned an invalid response.`);
    }
    return body.booking;
  }

  private confirmationToken(booking: Booking): string {
    const token = new URL(booking.confirmationUrl).pathname.split('/').pop();
    if (!token || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
      throw new Error(`Booking ${booking.id} has no valid private confirmation token.`);
    }
    return token;
  }
}
