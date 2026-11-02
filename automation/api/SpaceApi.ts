import type { APIRequestContext } from '@playwright/test';
import type { Availability } from '../../shared/contracts.js';
import { expectApiStatus } from './response.js';

export class SpaceApi {
  constructor(private readonly request: APIRequestContext) {}

  async getAvailability(spaceId: string, date: string, durationHours: number): Promise<Availability> {
    const response = await this.request.get(
      `/api/spaces/${spaceId}/availability?date=${encodeURIComponent(date)}&durationHours=${durationHours}`
    );
    await expectApiStatus(response, 200, 'Checking availability for the test booking');
    const body = await response.json() as Availability;
    if (!Array.isArray(body.slots)) {
      throw new Error('Checking test booking availability returned an invalid response.');
    }
    return body;
  }
}
