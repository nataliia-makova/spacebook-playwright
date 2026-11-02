import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { TIMEZONE, type OpeningHours, type SpaceInput } from '../../shared/contracts.js';

export type SignupInput = {
  fullName: string;
  email: string;
  password: string;
};

export function createUserInput(): SignupInput {
  const suffix = randomUUID();
  return {
    fullName: `Playwright Customer ${suffix}`,
    email: `playwright-${suffix}@example.test`,
    password: `Spacebook-${suffix}`
  };
}

export function createSpaceInput(): SpaceInput {
  const openingHours: OpeningHours = {
    '1': { opensAt: '09:00', closesAt: '20:00' },
    '2': { opensAt: '09:00', closesAt: '20:00' },
    '3': { opensAt: '09:00', closesAt: '20:00' },
    '4': { opensAt: '09:00', closesAt: '20:00' },
    '5': { opensAt: '09:00', closesAt: '20:00' },
    '6': { opensAt: '09:00', closesAt: '20:00' },
    '7': { opensAt: '09:00', closesAt: '20:00' }
  };

  return {
    name: `Playwright Test Space ${randomUUID()}`,
    type: 'podcast-booth',
    capacity: 2,
    equipment: [],
    hourlyRate: 4000,
    openingHours
  };
}

export function futureBookingDate(): string {
  const date = DateTime.now().setZone(TIMEZONE).plus({ days: 7 }).toISODate();
  if (!date) throw new Error(`Could not calculate a future date in ${TIMEZONE}.`);
  return date;
}
