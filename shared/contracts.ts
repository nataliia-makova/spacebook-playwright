import { z } from 'zod';

export const TIMEZONE = 'Europe/Warsaw' as const;
export const CURRENCY = 'EUR' as const;
export const spaceTypes = ['photography-studio', 'rehearsal-room', 'podcast-booth'] as const;
export const typeSchema = z.enum(spaceTypes);
export const uuidSchema = z.uuid();
const hourSchema = z.string().regex(/^(?:[01]\d|2[0-3]):00$/, 'Use a whole hour, for example 10:00.');
export const dateSchema = z.iso.date();
const trimmed = (max: number) => z.string().trim().min(1, 'This field is required.').max(max, `Must be at most ${max} characters.`);
export const nameSchema = trimmed(100);
export const emailSchema = z.string().trim().max(254).refine(
  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.'
);
export const durationSchema = z.number().int().min(1).max(4);
export const openingHoursSchema = z.object({
  '1': day(), '2': day(), '3': day(), '4': day(), '5': day(), '6': day(), '7': day()
}).strict();
function day() {
  return z.object({ opensAt: hourSchema, closesAt: hourSchema }).strict()
    .refine(v => v.opensAt < v.closesAt, { message: 'Opening time must precede closing time.', path: ['closesAt'] }).nullable();
}
export const createSpaceSchema = z.object({
  name: nameSchema, type: typeSchema, capacity: z.number().int().positive(),
  equipment: z.array(trimmed(100)), hourlyRate: z.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / 4)),
  openingHours: openingHoursSchema
}).strict();
export const spacesQuerySchema = z.object({
  type: typeSchema.optional(),
  minCapacity: z.coerce.number().int().positive().optional()
}).strict();
export const availabilityQuerySchema = z.object({
  date: dateSchema,
  durationHours: z.coerce.number().int().min(1).max(4)
}).strict();
export const legacyBookingInputSchema = z.object({
  spaceId: uuidSchema, date: dateSchema, startTime: hourSchema,
  durationHours: durationSchema, customerName: nameSchema, customerEmail: emailSchema
}).strict();

export const bookingInputSchema = z.object({
  spaceId: uuidSchema, date: dateSchema, startTime: hourSchema,
  durationHours: durationSchema
}).strict();
export const MIN_PASSWORD_LENGTH = 6;
export const signupSchema = z.object({
  fullName: nameSchema,
  email: emailSchema.transform(s => s.toLowerCase()),
  password: z.string().min(MIN_PASSWORD_LENGTH,`Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(128,'Use no more than 128 characters.')
}).strict();
export const signinSchema = z.object({
  email: emailSchema.transform(s => s.toLowerCase()),
  password: z.string().min(1,'Enter your password.')
}).strict();
export type User = { id:string; fullName:string; email:string; createdAt:string };

export type OpeningHours = z.infer<typeof openingHoursSchema>;
export type SpaceInput = z.infer<typeof createSpaceSchema>;
export type BookingInput = z.infer<typeof bookingInputSchema>;
export type Space = SpaceInput & {
  id: string; imageUrl: string; timezone: typeof TIMEZONE; currency: typeof CURRENCY;
};
export type Slot = { startTime: string; endTime: string };
export type Availability = {
  spaceId: string; date: string; durationHours: number;
  timezone: typeof TIMEZONE; hourlyRate: number; totalPrice: number; slots: Slot[];
};
export type Booking = {
  id: string; reference: string; spaceId: string; spaceName: string;
  customerName: string; customerEmail: string;
  startsAt: string; endsAt: string; durationHours: number;
  hourlyRate: number; totalPrice: number; currency: typeof CURRENCY;
  timezone: typeof TIMEZONE; status: 'confirmed' | 'cancelled';
  createdAt: string; cancelledAt: string | null; confirmationUrl: string;
};
export type ApiError = { error: { code: string; message: string; fieldErrors?: Record<string, string> } };
