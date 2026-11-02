import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import type { Booking, BookingInput } from '../../shared/contracts.js';
import { expectApiStatus } from './response.js';

export class BookingApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly origin: string
  ) {}

  async create(input: BookingInput): Promise<Booking> {
    const response = await this.request.post('/api/bookings', {
      headers: {
        Origin: this.origin,
        'Idempotency-Key': randomUUID()
      },
      data: input
    });
    await expectApiStatus(response, 201, 'Creating the test booking');
    const body = await response.json() as { booking: Booking };
    if (!body.booking || typeof body.booking.id !== 'string') {
      throw new Error('Creating the test booking returned an invalid response.');
    }
    return body.booking;
  }

  async cancel(booking: Booking): Promise<Booking> {
    const token = new URL(booking.confirmationUrl).pathname.split('/').pop();
    if (!token) throw new Error(`Booking ${booking.id} has no private confirmation token.`);
    const response = await this.request.post(`/api/bookings/${token}/cancel`, {
      headers: { Origin: this.origin }
    });
    await expectApiStatus(response, 200, `Cancelling test booking ${booking.reference}`);
    const body = await response.json() as { booking: Booking };
    if (body.booking?.id !== booking.id || body.booking.status !== 'cancelled') {
      throw new Error(`Cancelling test booking ${booking.reference} returned an invalid response.`);
    }
    return body.booking;
  }
}
