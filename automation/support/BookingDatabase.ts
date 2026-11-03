import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { E2E_DB_PATH } from './testConfig.js';

export type BookingDatabaseRecord = {
  id: string;
  reference: string;
  spaceId: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  startsAt: string;
  endsAt: string;
  durationHours: number;
  totalPrice: number;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  cancelledAt: string | null;
};

/** Read the same isolated SQLite database used by the Playwright web server. */
export function readBookingsForSpace(spaceId: string): BookingDatabaseRecord[] {
  const database = new DatabaseSync(path.resolve(E2E_DB_PATH), { readOnly: true });
  try {
    const query = [
      'SELECT id, reference, space_id AS spaceId, user_id AS userId,',
      'customer_name AS customerName, customer_email AS customerEmail,',
      'starts_at AS startsAt, ends_at AS endsAt, duration_hours AS durationHours,',
      'total_price AS totalPrice, status, created_at AS createdAt,',
      'cancelled_at AS cancelledAt FROM bookings WHERE space_id = ?'
    ].join(' ');
    return database.prepare(query).all(spaceId) as BookingDatabaseRecord[];
  } finally {
    database.close();
  }
}
