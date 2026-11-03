import type { APIRequestContext } from '@playwright/test';
import type { Space, SpaceInput } from '../../shared/contracts.js';
import { expectApiStatus } from './response.js';

export class TestSupportApi {
  constructor(private readonly request: APIRequestContext) {}

  async createSpace(input: SpaceInput): Promise<Space> {
    const response = await this.request.post('/api/test-support/spaces', { data: input });
    await expectApiStatus(response, 201, 'Creating the test space');
    const body = await response.json() as { space: Space };
    return body.space;
  }

  async deleteBooking(bookingId: string): Promise<void> {
    const response = await this.request.delete(`/api/test-support/bookings/${bookingId}`);
    await expectApiStatus(response, 204, `Deleting test booking ${bookingId}`);
  }

  async deleteSpace(spaceId: string): Promise<void> {
    const response = await this.request.delete(`/api/test-support/spaces/${spaceId}`);
    await expectApiStatus(response, 204, `Deleting test space ${spaceId}`);
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await this.request.delete(`/api/test-support/users/${userId}`);
    await expectApiStatus(response, 204, `Deleting test account ${userId}`);
  }
}
